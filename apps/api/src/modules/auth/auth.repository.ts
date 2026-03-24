export type UserRole = 'monitor' | 'trader' | 'executor' | 'institutional' | 'admin';
export type ApiKeyPermission = 'read' | 'execute' | 'admin';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  timezone: string;
  lastLoginAt: Date | null;
  loginCount: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  notificationPreferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  subscription: SubscriptionRecord | null;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  plan: 'monitor' | 'trader' | 'executor' | 'institutional';
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: ApiKeyPermission[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface PasswordHistoryRecord {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: Date;
}

export interface TwoFactorBackupCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
}

export interface AuditLogRecord {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface EmailJob {
  type: 'send-verification' | 'send-password-reset';
  userId: string;
  email: string;
  token: string;
}

export interface EmailJobQueue {
  enqueue(job: EmailJob): Promise<void>;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export interface EphemeralAuthStore {
  setPendingTwoFactor(userId: string, secret: string, ttlSeconds: number): Promise<void>;
  getPendingTwoFactor(userId: string): Promise<string | null>;
  deletePendingTwoFactor(userId: string): Promise<void>;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  createUser(input: Pick<UserRecord, 'email' | 'passwordHash' | 'name' | 'role' | 'emailVerified'>): Promise<UserRecord>;
  updateUser(userId: string, updates: Partial<UserRecord>): Promise<UserRecord>;
  createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumeEmailVerificationToken(tokenHash: string, now: Date): Promise<string | null>;
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumePasswordResetToken(tokenHash: string, now: Date): Promise<string | null>;
  deletePasswordResetTokens(userId: string): Promise<void>;
  createRefreshToken(input: Omit<RefreshTokenRecord, 'id' | 'createdAt'>): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  updateRefreshToken(tokenId: string, updates: Partial<RefreshTokenRecord>): Promise<RefreshTokenRecord>;
  revokeRefreshFamily(familyId: string, revokedAt: Date): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string, revokedAt: Date): Promise<void>;
  listRefreshTokensByUser(userId: string): Promise<RefreshTokenRecord[]>;
  replaceBackupCodes(userId: string, codeHashes: string[]): Promise<void>;
  listBackupCodesByUser(userId: string): Promise<TwoFactorBackupCodeRecord[]>;
  markBackupCodeUsed(codeId: string, usedAt: Date): Promise<void>;
  deleteBackupCodes(userId: string): Promise<void>;
  createApiKey(input: Omit<ApiKeyRecord, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<ApiKeyRecord>;
  listApiKeysByUser(userId: string): Promise<ApiKeyRecord[]>;
  findApiKeyById(userId: string, keyId: string): Promise<ApiKeyRecord | null>;
  findApiKeysByPrefix(prefix: string): Promise<ApiKeyRecord[]>;
  updateApiKey(keyId: string, updates: Partial<ApiKeyRecord>): Promise<ApiKeyRecord>;
  addPasswordHistory(userId: string, passwordHash: string): Promise<PasswordHistoryRecord>;
  listPasswordHistory(userId: string, limit: number): Promise<PasswordHistoryRecord[]>;
  createAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<AuditLogRecord>;
}

export interface PrismaUserModel {
  findUnique(args: { where: { id?: string; email?: string } }): Promise<any | null>;
  create(args: { data: any }): Promise<any>;
  update(args: { where: { id: string }; data: any }): Promise<any>;
}

export interface PrismaRefreshTokenModel {
  create(args: { data: any }): Promise<any>;
  findUnique(args: { where: { tokenHash?: string; id?: string } }): Promise<any | null>;
  update(args: { where: { id: string }; data: any }): Promise<any>;
  updateMany(args: { where: any; data: any }): Promise<{ count: number }>;
  findMany(args: { where: any; orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<any[]>;
}

export interface PrismaTokenModel {
  create(args: { data: any }): Promise<any>;
  findUnique(args: { where: { tokenHash: string } }): Promise<any | null>;
  update(args: { where: { id: string }; data: any }): Promise<any>;
  deleteMany(args: { where: any }): Promise<{ count: number }>;
}

export interface PrismaTwoFactorBackupCodeModel {
  createMany(args: { data: any[] }): Promise<{ count: number }>;
  findMany(args: { where: any; orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<any[]>;
  update(args: { where: { id: string }; data: any }): Promise<any>;
  deleteMany(args: { where: any }): Promise<{ count: number }>;
}

export interface PrismaApiKeyModel {
  create(args: { data: any }): Promise<any>;
  findMany(args: { where: any; orderBy?: { createdAt: 'asc' | 'desc' } }): Promise<any[]>;
  findFirst(args: { where: any }): Promise<any | null>;
  update(args: { where: { id: string }; data: any }): Promise<any>;
}

export interface PrismaPasswordHistoryModel {
  create(args: { data: any }): Promise<any>;
  findMany(args: { where: any; orderBy?: { createdAt: 'asc' | 'desc' }; take?: number }): Promise<any[]>;
}

export interface PrismaAuditLogModel {
  create(args: { data: any }): Promise<any>;
}

export interface PrismaClientLike {
  user: PrismaUserModel;
  refreshToken: PrismaRefreshTokenModel;
  emailVerificationToken: PrismaTokenModel;
  passwordResetToken: PrismaTokenModel;
  twoFactorBackupCode: PrismaTwoFactorBackupCodeModel;
  apiKey: PrismaApiKeyModel;
  passwordHistory: PrismaPasswordHistoryModel;
  auditLog: PrismaAuditLogModel;
}

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

const toUserRecord = (record: any): UserRecord => ({
  id: record.id,
  email: record.email,
  passwordHash: record.passwordHash,
  name: record.name,
  role: record.role,
  emailVerified: record.emailVerified,
  emailVerifiedAt: record.emailVerifiedAt,
  timezone: record.timezone,
  lastLoginAt: record.lastLoginAt,
  loginCount: record.loginCount,
  failedLoginCount: record.failedLoginCount,
  lockedUntil: record.lockedUntil,
  twoFactorEnabled: record.twoFactorEnabled,
  twoFactorSecret: record.twoFactorSecret,
  notificationPreferences: record.notificationPreferences ?? {},
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  deletedAt: record.deletedAt,
  subscription: record.subscription
    ? {
        id: record.subscription.id,
        userId: record.subscription.userId,
        plan: record.subscription.plan,
        status: record.subscription.status,
        currentPeriodStart: record.subscription.currentPeriodStart,
        currentPeriodEnd: record.subscription.currentPeriodEnd,
      }
    : null,
});

const toRefreshTokenRecord = (record: any): RefreshTokenRecord => ({
  id: record.id,
  userId: record.userId,
  tokenHash: record.tokenHash,
  familyId: record.familyId,
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt,
  replacedById: record.replacedById ?? null,
  ipAddress: record.ipAddress ?? null,
  userAgent: record.userAgent ?? null,
  lastUsedAt: record.lastUsedAt ?? null,
  createdAt: record.createdAt,
});

const toApiKeyRecord = (record: any): ApiKeyRecord => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  keyPrefix: record.keyPrefix,
  keyHash: record.keyHash,
  permissions: Array.isArray(record.permissions) ? record.permissions : [],
  lastUsedAt: record.lastUsedAt ?? null,
  expiresAt: record.expiresAt ?? null,
  revokedAt: record.revokedAt ?? null,
  createdAt: record.createdAt,
});

const toBackupCodeRecord = (record: any): TwoFactorBackupCodeRecord => ({
  id: record.id,
  userId: record.userId,
  codeHash: record.codeHash,
  usedAt: record.usedAt ?? null,
  createdAt: record.createdAt,
});

const toPasswordHistoryRecord = (record: any): PasswordHistoryRecord => ({
  id: record.id,
  userId: record.userId,
  passwordHash: record.passwordHash,
  createdAt: record.createdAt,
});

const toAuditLogRecord = (record: any): AuditLogRecord => ({
  id: record.id,
  userId: record.userId ?? null,
  action: record.action,
  resourceType: record.resourceType,
  resourceId: record.resourceId ?? null,
  details: record.details ?? {},
  ipAddress: record.ipAddress ?? null,
  userAgent: record.userAgent ?? null,
  requestId: record.requestId ?? null,
  createdAt: record.createdAt,
});

export class PrismaAuthRepository implements AuthRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? toUserRecord(record) : null;
  }

  public async findUserById(userId: string): Promise<UserRecord | null> {
    const record = await this.prisma.user.findUnique({ where: { id: userId } });
    return record ? toUserRecord(record) : null;
  }

  public async createUser(input: Pick<UserRecord, 'email' | 'passwordHash' | 'name' | 'role' | 'emailVerified'>) {
    return toUserRecord(
      await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          name: input.name,
          role: input.role,
          emailVerified: input.emailVerified,
          timezone: 'UTC',
          notificationPreferences: {},
          subscription: undefined,
        },
      }),
    );
  }

  public async updateUser(userId: string, updates: Partial<UserRecord>) {
    return toUserRecord(await this.prisma.user.update({ where: { id: userId }, data: updates }));
  }

  public async createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  public async consumeEmailVerificationToken(tokenHash: string, now: Date): Promise<string | null> {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    await this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } });
    return record.userId;
  }

  public async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  public async consumePasswordResetToken(tokenHash: string, now: Date): Promise<string | null> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
      return null;
    }

    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } });
    return record.userId;
  }

  public async deletePasswordResetTokens(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });
  }

  public async createRefreshToken(input: Omit<RefreshTokenRecord, 'id' | 'createdAt'>) {
    return toRefreshTokenRecord(await this.prisma.refreshToken.create({ data: input }));
  }

  public async findRefreshTokenByHash(tokenHash: string) {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return record ? toRefreshTokenRecord(record) : null;
  }

  public async updateRefreshToken(tokenId: string, updates: Partial<RefreshTokenRecord>) {
    return toRefreshTokenRecord(await this.prisma.refreshToken.update({ where: { id: tokenId }, data: updates }));
  }

  public async revokeRefreshFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  public async revokeAllRefreshTokensForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }

  public async listRefreshTokensByUser(userId: string) {
    return (await this.prisma.refreshToken.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
      toRefreshTokenRecord,
    );
  }

  public async replaceBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
    await this.prisma.twoFactorBackupCode.createMany({
      data: codeHashes.map((codeHash) => ({ userId, codeHash })),
    });
  }

  public async listBackupCodesByUser(userId: string) {
    return (await this.prisma.twoFactorBackupCode.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(
      toBackupCodeRecord,
    );
  }

  public async markBackupCodeUsed(codeId: string, usedAt: Date): Promise<void> {
    await this.prisma.twoFactorBackupCode.update({ where: { id: codeId }, data: { usedAt } });
  }

  public async deleteBackupCodes(userId: string): Promise<void> {
    await this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
  }

  public async createApiKey(input: Omit<ApiKeyRecord, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>) {
    return toApiKeyRecord(await this.prisma.apiKey.create({ data: input }));
  }

  public async listApiKeysByUser(userId: string) {
    return (await this.prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(toApiKeyRecord);
  }

  public async findApiKeyById(userId: string, keyId: string) {
    const record = await this.prisma.apiKey.findFirst({ where: { id: keyId, userId } });
    return record ? toApiKeyRecord(record) : null;
  }

  public async findApiKeysByPrefix(prefix: string) {
    return (await this.prisma.apiKey.findMany({ where: { keyPrefix: prefix } })).map(toApiKeyRecord);
  }

  public async updateApiKey(keyId: string, updates: Partial<ApiKeyRecord>) {
    return toApiKeyRecord(await this.prisma.apiKey.update({ where: { id: keyId }, data: updates }));
  }

  public async addPasswordHistory(userId: string, passwordHash: string) {
    return toPasswordHistoryRecord(await this.prisma.passwordHistory.create({ data: { userId, passwordHash } }));
  }

  public async listPasswordHistory(userId: string, limit: number) {
    return (
      await this.prisma.passwordHistory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit })
    ).map(toPasswordHistoryRecord);
  }

  public async createAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>) {
    return toAuditLogRecord(await this.prisma.auditLog.create({ data: input }));
  }
}

export class RedisEphemeralAuthStore implements EphemeralAuthStore {
  public constructor(
    private readonly redis: RedisClientLike,
    private readonly keyPrefix: string,
  ) {}

  public async setPendingTwoFactor(userId: string, secret: string, ttlSeconds: number): Promise<void> {
    await this.redis.setex(`${this.keyPrefix}2fa:pending:${userId}`, ttlSeconds, secret);
  }

  public async getPendingTwoFactor(userId: string): Promise<string | null> {
    return this.redis.get(`${this.keyPrefix}2fa:pending:${userId}`);
  }

  public async deletePendingTwoFactor(userId: string): Promise<void> {
    await this.redis.del(`${this.keyPrefix}2fa:pending:${userId}`);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  public constructor(
    private readonly redis: RedisClientLike,
    private readonly keyPrefix: string,
  ) {}

  public async consume(key: string, limit: number, windowSeconds: number) {
    const namespacedKey = `${this.keyPrefix}ratelimit:${key}`;
    const count = await this.redis.incr(namespacedKey);
    if (count === 1) {
      await this.redis.expire(namespacedKey, windowSeconds);
    }

    if (count > limit) {
      const ttl = await this.redis.ttl(namespacedKey);
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export class RedisEmailJobQueue implements EmailJobQueue {
  public constructor(
    private readonly redis: RedisClientLike,
    private readonly queueKey: string,
  ) {}

  public async enqueue(job: EmailJob): Promise<void> {
    await this.redis.rpush(this.queueKey, JSON.stringify(job));
  }
}
