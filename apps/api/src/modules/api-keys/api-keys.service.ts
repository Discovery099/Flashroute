import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { ApiError } from '../../app';
import type { ApiKeyPermission, ApiKeyRecord, AuthRepository, UserRole } from '../auth/auth.repository';
import { permissionsForRole, type AuthServiceOptions, type RequestContext } from '../auth/auth.service';
import type { CreateApiKeyInput, UpdateApiKeyInput } from '../auth/auth.schemas';

const hashWithPepper = (value: string, pepper: string) => createHash('sha256').update(`${value}:${pepper}`).digest('hex');

const maxKeysByRole: Record<UserRole, number> = {
  monitor: 0,
  trader: 5,
  executor: 10,
  institutional: 20,
  admin: 20,
};

const scopesAllowedForRole = (role: UserRole, scopes: ApiKeyPermission[]) => {
  const allowed = permissionsForRole(role);
  return scopes.every((scope) => allowed.includes(scope));
};

export class ApiKeysService {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly authOptions: Pick<AuthServiceOptions, 'apiKeyPepper'>,
  ) {}

  public async create(userId: string, input: CreateApiKeyInput, context?: RequestContext) {
    const user = await this.requireUser(userId);
    if (user.role === 'monitor') {
      throw new ApiError(403, 'TIER_LIMIT', 'API keys require trader tier or higher');
    }

    if (!scopesAllowedForRole(user.role, input.permissions)) {
      throw new ApiError(403, 'FORBIDDEN', 'Permission exceeds role entitlements');
    }

    const existing = (await this.repository.listApiKeysByUser(userId)).filter((key) => key.revokedAt === null);
    if (existing.length >= maxKeysByRole[user.role]) {
      throw new ApiError(403, 'TIER_LIMIT', 'API key limit reached');
    }

    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const key = `fr_live_${prefix}_${secret}`;
    const record = await this.repository.createApiKey({
      userId,
      name: input.name,
      keyPrefix: prefix,
      keyHash: this.hashApiKey(key),
      permissions: input.permissions,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    await this.repository.createAuditLog({
      userId,
      action: 'user.api_key.created',
      resourceType: 'api_key',
      resourceId: record.id,
      details: {
        permissions: input.permissions,
      },
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });

    return {
      apiKey: this.toDto(record),
      key,
      warning: 'Save this key now. It cannot be retrieved again.',
    };
  }

  public async list(userId: string) {
    return (await this.repository.listApiKeysByUser(userId))
      .filter((key) => key.revokedAt === null)
      .map((key) => this.toDto(key));
  }

  public async update(userId: string, keyId: string, input: UpdateApiKeyInput, context?: RequestContext) {
    const key = await this.repository.findApiKeyById(userId, keyId);
    if (!key || key.revokedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'API key not found');
    }

    const user = await this.requireUser(userId);
    if (input.permissions && !scopesAllowedForRole(user.role, input.permissions)) {
      throw new ApiError(403, 'FORBIDDEN', 'Permission exceeds role entitlements');
    }

    const updated = await this.repository.updateApiKey(keyId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }),
      });
    await this.repository.createAuditLog({
      userId,
      action: 'user.api_key.updated',
      resourceType: 'api_key',
      resourceId: keyId,
      details: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      },
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });
    return this.toDto(updated);
  }

  public async revoke(userId: string, keyId: string, context?: RequestContext) {
    const key = await this.repository.findApiKeyById(userId, keyId);
    if (!key || key.revokedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'API key not found');
    }

    await this.repository.updateApiKey(keyId, { revokedAt: new Date() });
    await this.repository.createAuditLog({
      userId,
      action: 'user.api_key.revoked',
      resourceType: 'api_key',
      resourceId: keyId,
      details: {},
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });
  }

  public async authenticate(fullKey: string) {
    const parts = fullKey.split('_');
    if (parts.length < 4 || parts[0] !== 'fr' || parts[1] !== 'live') {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key');
    }

    const prefix = parts[2]!;
    const candidates = await this.repository.findApiKeysByPrefix(prefix);
    const presentedHash = this.hashApiKey(fullKey);
    const match = candidates.find((candidate) => this.safeCompare(candidate.keyHash, presentedHash));
    if (!match || match.revokedAt || (match.expiresAt && match.expiresAt.getTime() <= Date.now())) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key');
    }

    const user = await this.requireUser(match.userId);
    await this.repository.updateApiKey(match.id, { lastUsedAt: new Date() });

    return {
      userId: user.id,
      role: user.role,
      permissions: match.permissions,
      authMethod: 'api_key' as const,
    };
  }

  private async requireUser(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user || user.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }
    return user;
  }

  private hashApiKey(key: string) {
    return hashWithPepper(key, this.authOptions.apiKeyPepper);
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private toDto(record: ApiKeyRecord) {
    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      permissions: record.permissions,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
