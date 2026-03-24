import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

import { ApiError } from '../../app';
import { isBreachedPassword } from './breached-passwords';
import type {
  ApiKeyPermission,
  AuthRepository,
  EmailJobQueue,
  EphemeralAuthStore,
  RateLimitStore,
  UserRecord,
  UserRole,
} from './auth.repository';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schemas';

export interface AuthServiceOptions {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  bcryptRounds: number;
  refreshTokenPepper: string;
  apiKeyPepper: string;
  redisKeyPrefix?: string;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  timezone: string;
  twoFactorEnabled: boolean;
  notificationPreferences: Record<string, unknown>;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserDto;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp: number;
  iat: number;
}

const REGISTER_RATE_LIMIT = { limit: 5, windowSeconds: 60 };
const LOGIN_RATE_LIMIT = { limit: 10, windowSeconds: 60 };
const FORGOT_PASSWORD_RATE_LIMIT = { limit: 3, windowSeconds: 60 };
const REFRESH_RATE_LIMIT = { limit: 30, windowSeconds: 60 * 60 };
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 30 * 60 * 1000;
const PASSWORD_HISTORY_LIMIT = 5;

const base64UrlEncode = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${'='.repeat(padLength)}`, 'base64').toString('utf8');
};

const hashWithPepper = (value: string, pepper: string) => createHash('sha256').update(`${value}:${pepper}`).digest('hex');

export const permissionsForRole = (role: UserRole): ApiKeyPermission[] => {
  switch (role) {
    case 'monitor':
      return ['read'];
    case 'trader':
      return ['read'];
    case 'executor':
      return ['read', 'execute'];
    case 'institutional':
    case 'admin':
      return ['read', 'execute', 'admin'];
    default:
      return ['read'];
  }
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const passwordMeetsPolicy = (password: string, email: string, name: string) => {
  const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$/;
  if (!strong.test(password)) {
    return false;
  }

  const normalizedPassword = password.toLowerCase();
  const emailLocalPart = normalizeEmail(email).split('@')[0] ?? '';
  if (emailLocalPart && normalizedPassword.includes(emailLocalPart)) {
    return false;
  }

  const nameTokens = name
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return !nameTokens.some((token) => normalizedPassword.includes(token));
};

const totpWindow = { window: [1, 1] as [number, number] };

export class AuthService {
  private readonly encryptionKey: Buffer;

  public constructor(
    private readonly repository: AuthRepository,
    private readonly ephemeralStore: EphemeralAuthStore,
    private readonly emailQueue: EmailJobQueue,
    private readonly rateLimitStore: RateLimitStore,
    private readonly options: AuthServiceOptions,
  ) {
    this.encryptionKey = createHash('sha256').update(this.options.jwtSecret).digest();
  }

  public toUserDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      twoFactorEnabled: user.twoFactorEnabled,
      notificationPreferences: user.notificationPreferences ?? {},
      subscription: user.subscription
        ? {
            plan: user.subscription.plan,
            status: user.subscription.status,
            currentPeriodEnd: user.subscription.currentPeriodEnd.toISOString(),
          }
        : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  public async register(input: RegisterInput, context: RequestContext): Promise<AuthTokenPair> {
    await this.assertRateLimit(`register:${context.ipAddress ?? 'unknown'}`, REGISTER_RATE_LIMIT.limit, REGISTER_RATE_LIMIT.windowSeconds);

    const email = normalizeEmail(input.email);
    if (await this.repository.findUserByEmail(email)) {
      throw new ApiError(409, 'CONFLICT', 'Email already registered');
    }

    this.assertPasswordPolicy(input.password, email, input.name);

    const passwordHash = await bcrypt.hash(input.password, this.options.bcryptRounds);
    const user = await this.repository.createUser({
      email,
      passwordHash,
      name: input.name.trim(),
      role: 'monitor',
      emailVerified: false,
    });

    const token = randomBytes(32).toString('hex');
    await this.repository.createEmailVerificationToken(
      user.id,
      this.hashRefreshToken(token),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    await this.emailQueue.enqueue({ type: 'send-verification', userId: user.id, email: user.email, token });
    await this.audit(user.id, 'user.register', 'user', user.id, { role: user.role }, context);
    await this.audit(user.id, 'user.email_verification.sent', 'user', user.id, {}, context);

    return this.issueTokenPair(user, context, new Date());
  }

  public async login(input: LoginInput, context: RequestContext): Promise<AuthTokenPair> {
    const email = normalizeEmail(input.email);
    await this.assertRateLimit(`login:ip:${context.ipAddress ?? 'unknown'}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowSeconds);
    await this.assertRateLimit(`login:account:${email}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowSeconds);

    const user = await this.repository.findUserByEmail(email);
    if (!user || user.deletedAt) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      throw new ApiError(401, 'UNAUTHORIZED', `Account locked until ${user.lockedUntil.toISOString()}`);
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      const nextFailedLoginCount = user.failedLoginCount + 1;
      const updates: Partial<UserRecord> = { failedLoginCount: nextFailedLoginCount };
      if (nextFailedLoginCount >= LOCKOUT_THRESHOLD) {
        updates.lockedUntil = new Date(now.getTime() + LOCKOUT_WINDOW_MS);
        await this.repository.revokeAllRefreshTokensForUser(user.id, now);
        await this.audit(user.id, 'user.account.locked', 'user', user.id, { failedLoginCount: nextFailedLoginCount }, context);
      }
      await this.repository.updateUser(user.id, updates);
      await this.audit(user.id, 'user.login.failed', 'user', user.id, { failedLoginCount: nextFailedLoginCount }, context);
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      if (!input.totpCode) {
        throw new ApiError(401, 'UNAUTHORIZED', '2FA code required', { requiresTwoFactor: true });
      }

      const secret = this.decryptSecret(user.twoFactorSecret);
      const validCode = authenticator.verify({ token: input.totpCode, secret, ...totpWindow });
      if (!validCode) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Invalid 2FA code');
      }
    }

    const updatedUser = await this.repository.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
      loginCount: user.loginCount + 1,
    });
    await this.audit(user.id, 'user.login.success', 'user', user.id, {}, context);

    return this.issueTokenPair(updatedUser, context, now);
  }

  public async refreshTokens(refreshToken: string, context: RequestContext): Promise<AuthTokenPair> {
    await this.assertRateLimit(`refresh:${context.ipAddress ?? 'unknown'}`, REFRESH_RATE_LIMIT.limit, REFRESH_RATE_LIMIT.windowSeconds);

    const now = new Date();
    const token = await this.repository.findRefreshTokenByHash(this.hashRefreshToken(refreshToken));
    if (!token) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    if (token.revokedAt) {
      await this.repository.revokeRefreshFamily(token.familyId, now);
      await this.audit(token.userId, 'auth.refresh.reuse_detected', 'refresh_token_family', token.familyId, {
        familyId: token.familyId,
      }, context);
      throw new ApiError(401, 'UNAUTHORIZED', 'Token reuse detected. All sessions revoked.');
    }

    if (token.expiresAt.getTime() <= now.getTime()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Refresh token expired');
    }

    const user = await this.repository.findUserById(token.userId);
    if (!user || user.deletedAt) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    await this.repository.updateRefreshToken(token.id, { revokedAt: now, lastUsedAt: now });
    const rotated = await this.issueTokenPair(user, context, now, token.familyId);
    const replacement = await this.repository.findRefreshTokenByHash(this.hashRefreshToken(rotated.refreshToken));
    if (replacement) {
      await this.repository.updateRefreshToken(token.id, { replacedById: replacement.id });
    }

    return rotated;
  }

  public async logout(userId: string, refreshToken: string): Promise<void> {
    const token = await this.repository.findRefreshTokenByHash(this.hashRefreshToken(refreshToken));
    if (!token || token.userId !== userId || token.revokedAt) {
      return;
    }

    await this.repository.updateRefreshToken(token.id, { revokedAt: new Date() });
  }

  public async logoutWithContext(userId: string, refreshToken: string, context: RequestContext): Promise<void> {
    const token = await this.repository.findRefreshTokenByHash(this.hashRefreshToken(refreshToken));
    if (!token || token.userId !== userId || token.revokedAt) {
      return;
    }

    await this.repository.updateRefreshToken(token.id, { revokedAt: new Date() });
    await this.audit(userId, 'user.logout', 'refresh_token', token.id, {}, context);
  }

  public async verifyEmail(token: string): Promise<void> {
    const userId = await this.repository.consumeEmailVerificationToken(this.hashRefreshToken(token), new Date());
    if (!userId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid or expired verification token');
    }

    await this.repository.updateUser(userId, { emailVerified: true, emailVerifiedAt: new Date() });
    await this.audit(userId, 'user.email_verified', 'user', userId, {});
  }

  public async forgotPassword(emailInput: string, context: RequestContext): Promise<void> {
    const email = normalizeEmail(emailInput);
    await this.assertRateLimit(`forgot-password:${context.ipAddress ?? 'unknown'}:${email}`, FORGOT_PASSWORD_RATE_LIMIT.limit, FORGOT_PASSWORD_RATE_LIMIT.windowSeconds);

    const user = await this.repository.findUserByEmail(email);
    if (!user || user.deletedAt) {
      return;
    }

    const token = randomBytes(32).toString('hex');
    await this.repository.createPasswordResetToken(
      user.id,
      this.hashRefreshToken(token),
      new Date(Date.now() + 60 * 60 * 1000),
    );
    await this.emailQueue.enqueue({ type: 'send-password-reset', userId: user.id, email: user.email, token });
    await this.audit(user.id, 'user.password_reset.requested', 'user', user.id, {}, context);
  }

  public async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.repository.consumePasswordResetToken(this.hashRefreshToken(token), new Date());
    if (!userId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid or expired reset token');
    }

    const user = await this.requireUser(userId);
    this.assertPasswordPolicy(password, user.email, user.name);
    await this.ensurePasswordNotReused(user, password);
    await this.repository.addPasswordHistory(user.id, user.passwordHash);
    await this.repository.updateUser(user.id, { passwordHash: await bcrypt.hash(password, this.options.bcryptRounds) });
    await this.repository.revokeAllRefreshTokensForUser(user.id, new Date());
    await this.repository.deletePasswordResetTokens(user.id);
    await this.audit(user.id, 'user.password_reset.completed', 'user', user.id, {});
  }

  public async setupTwoFactor(userId: string, _context?: RequestContext) {
    const user = await this.requireUser(userId);
    const secret = authenticator.generateSecret();
    await this.ephemeralStore.setPendingTwoFactor(userId, this.encryptSecret(secret), 10 * 60);
    return {
      secret,
      qrCodeUrl: authenticator.keyuri(user.email, 'FlashRoute', secret),
    };
  }

  public async verifyTwoFactor(userId: string, code: string, context?: RequestContext) {
    const encryptedSecret = await this.ephemeralStore.getPendingTwoFactor(userId);
    if (!encryptedSecret) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid or expired 2FA setup');
    }
    const secret = this.decryptSecret(encryptedSecret);

    if (!authenticator.verify({ token: code, secret, ...totpWindow })) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid 2FA code');
    }

    const backupCodes = Array.from({ length: 8 }, () => {
      const raw = randomBytes(4).toString('hex').toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });

    await this.repository.updateUser(userId, {
      twoFactorEnabled: true,
      twoFactorSecret: this.encryptSecret(secret),
    });
    await this.repository.replaceBackupCodes(
      userId,
      backupCodes.map((backupCode) => this.hashRefreshToken(backupCode)),
    );
    await this.ephemeralStore.deletePendingTwoFactor(userId);
    await this.audit(userId, 'user.2fa.enabled', 'user', userId, {}, context);

    return { backupCodes };
  }

  public async disableTwoFactor(userId: string, code: string, context?: RequestContext) {
    const user = await this.requireUser(userId);
    const secret = this.decryptSecret(user.twoFactorSecret);
    const now = new Date();

    if (!authenticator.verify({ token: code, secret, ...totpWindow })) {
      const backupCodes = await this.repository.listBackupCodesByUser(userId);
      const codeHash = this.hashRefreshToken(code);
      const backupCode = backupCodes.find((candidate) => candidate.usedAt === null && this.safeHashEquals(candidate.codeHash, codeHash));

      if (!backupCode) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid 2FA code');
      }

      await this.repository.markBackupCodeUsed(backupCode.id, now);
      await this.audit(userId, 'user.2fa.recovery_code_used', 'user', userId, {}, context);
    }

    await this.repository.updateUser(userId, { twoFactorEnabled: false, twoFactorSecret: null });
    await this.repository.deleteBackupCodes(userId);
    await this.repository.revokeAllRefreshTokensForUser(userId, now);
    await this.audit(userId, 'user.2fa.disabled', 'user', userId, {}, context);
  }

  public async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.requireUser(userId);
    return this.repository.updateUser(user.id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.notificationPreferences === undefined
        ? {}
        : { notificationPreferences: { ...user.notificationPreferences, ...input.notificationPreferences } }),
    });
  }

  public async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Current password is incorrect');
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'New password must differ from current password');
    }

    this.assertPasswordPolicy(newPassword, user.email, user.name);
    await this.ensurePasswordNotReused(user, newPassword);
    await this.repository.addPasswordHistory(user.id, user.passwordHash);
    await this.repository.updateUser(user.id, { passwordHash: await bcrypt.hash(newPassword, this.options.bcryptRounds) });
    await this.repository.revokeAllRefreshTokensForUser(user.id, new Date());
    await this.repository.deletePasswordResetTokens(user.id);
    await this.audit(user.id, 'user.password.changed', 'user', user.id, {});
  }

  public verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
      if (!headerSegment || !payloadSegment || !signatureSegment) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Invalid access token');
      }

      const expectedSignature = base64UrlEncode(
        createHmac('sha256', this.options.jwtSecret).update(`${headerSegment}.${payloadSegment}`).digest(),
      );
      if (signatureSegment !== expectedSignature) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Invalid access token');
      }

      const payload = JSON.parse(base64UrlDecode(payloadSegment)) as AccessTokenPayload;
      if (!payload.sub || !payload.email || !payload.role || typeof payload.exp !== 'number') {
        throw new ApiError(401, 'UNAUTHORIZED', 'Invalid access token');
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Access token expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid access token');
    }
  }

  public hashRefreshToken(token: string) {
    return hashWithPepper(token, this.options.refreshTokenPepper);
  }

  public hashApiKey(token: string) {
    return hashWithPepper(token, this.options.apiKeyPepper);
  }

  public async requireUser(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user || user.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }
    return user;
  }

  private async assertRateLimit(key: string, limit: number, windowSeconds: number) {
    const result = await this.rateLimitStore.consume(key, limit, windowSeconds);
    if (!result.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded', { retryAfter: result.retryAfterSeconds });
    }
  }

  private assertPasswordPolicy(password: string, email: string, name: string) {
    if (isBreachedPassword(password)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Password does not meet policy requirements', [
        { field: 'password', message: 'Password appears in the internal breached-password list' },
      ]);
    }

    if (!passwordMeetsPolicy(password, email, name)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Password does not meet policy requirements', [
        { field: 'password', message: 'Password must be strong and must not contain personal identifiers' },
      ]);
    }
  }

  private async ensurePasswordNotReused(user: UserRecord, password: string) {
    const history = await this.repository.listPasswordHistory(user.id, PASSWORD_HISTORY_LIMIT);
    for (const entry of history) {
      if (await bcrypt.compare(password, entry.passwordHash)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Password was used recently');
      }
    }
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decryptSecret(secret: string | null) {
    if (!secret) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Two-factor authentication is not enabled');
    }

    try {
      const [ivPart, tagPart, encryptedPart] = secret.split('.');
      if (!ivPart || !tagPart || !encryptedPart) {
        throw new Error('Malformed secret');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(ivPart, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, 'base64url')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Two-factor secret is invalid');
    }
  }

  private safeHashEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async audit(
    userId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    details: Record<string, unknown>,
    context?: RequestContext,
  ) {
    await this.repository.createAuditLog({
      userId,
      action,
      resourceType,
      resourceId,
      details: {
        ...details,
        ...(context?.requestId ? { requestId: context.requestId } : {}),
        ...(context?.userAgent ? { userAgent: context.userAgent } : {}),
      },
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });
  }

  private async issueTokenPair(
    user: UserRecord,
    context: RequestContext,
    now: Date,
    familyId: string = randomUUID(),
  ): Promise<AuthTokenPair> {
    const refreshToken = randomBytes(48).toString('hex');
    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: this.hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(now.getTime() + this.options.refreshTokenTtlSeconds * 1000),
      revokedAt: null,
      replacedById: null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      lastUsedAt: null,
    });

    return {
      accessToken: this.createAccessToken(user, now),
      refreshToken,
      expiresIn: this.options.accessTokenTtlSeconds,
      user: this.toUserDto(user),
    };
  }

  private createAccessToken(user: UserRecord, now: Date) {
    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(now.getTime() / 1000) + this.options.accessTokenTtlSeconds,
      }),
    );
    const signature = base64UrlEncode(createHmac('sha256', this.options.jwtSecret).update(`${header}.${payload}`).digest());
    return `${header}.${payload}.${signature}`;
  }
}
