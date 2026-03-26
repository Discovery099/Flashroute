import { createHmac } from 'node:crypto';

import { ApiError } from '../../app';
import type { AuthService } from '../auth/auth.service';
import type { UserRole } from '../auth/auth.repository';

export interface PrismaAdminClient {
  user: {
    findUnique(args: { where: { id?: string; email?: string }; include?: { subscription?: boolean } }): Promise<any | null>;
    findMany(args: {
      where?: Record<string, unknown>;
      include?: { subscription?: boolean };
      orderBy?: Record<string, 'asc' | 'desc'>;
      skip?: number;
      take?: number;
    }): Promise<any[]>;
    count(args: { where?: Record<string, unknown> }): Promise<number>;
    update(args: { where: { id: string }; data: Record<string, unknown>; include?: { subscription?: boolean } }): Promise<any>;
  };
  subscription: {
    update(args: { where: { userId: string }; data: Record<string, unknown> }): Promise<any>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
  };
  systemConfig: {
    findMany(): Promise<any[]>;
    findUnique(args: { where: { key: string } }): Promise<any | null>;
    update(args: { where: { key: string }; data: Record<string, unknown> }): Promise<any>;
  };
  refreshToken: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  $queryRaw<T>(query: string | { raw: string }): Promise<T>;
}

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  publish(channel: string, message: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  subscription: AdminSubscriptionRecord | null;
}

export interface AdminSubscriptionRecord {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserFilters {
  role?: UserRole;
  status?: 'active' | 'locked' | 'deleted';
  search?: string;
  billingStatus?: string;
  sortBy?: 'createdAt' | 'email' | 'name' | 'role';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdminUserUpdate {
  role?: UserRole;
  lockedUntil?: Date | null;
  deletedAt?: Date | null;
}

export interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
}

export interface SystemHealth {
  database: { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number };
  redis: { status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number };
  chains: Record<number, { status: 'healthy' | 'degraded' | 'unhealthy'; latestBlock?: number; blocksBehind?: number; latencyMs?: number }>;
  workers: Record<string, { status: 'running' | 'stopped' | 'unknown'; lastHeartbeat?: string }>;
  system: { uptimeSeconds: number; memoryUsageMb: number };
}

export interface SystemConfigDTO {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface QueueInfo {
  name: string;
  active: number;
  delayed: number;
  failed: number;
  paused: boolean;
  oldestJobAge?: string;
}

const RUNTIME_CONFIG_KEYS: Record<string, { type: 'number' | 'boolean'; min?: number; max?: number }> = {
  global_min_profit_usd: { type: 'number', min: 0, max: 10000 },
  max_concurrent_executions: { type: 'number', min: 1, max: 10 },
  mempool_monitoring_enabled: { type: 'boolean' },
  profit_sweep_enabled: { type: 'boolean' },
  new_registration_enabled: { type: 'boolean' },
  maintenance_mode: { type: 'boolean' },
  execution_paused: { type: 'boolean' },
};

const base64UrlEncode = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export class AdminService {
  public constructor(
    private readonly prisma: PrismaAdminClient,
    private readonly redis: RedisClientLike,
    private readonly authService: AuthService,
    private readonly jwtSecret: string,
    private readonly supportedChainRpcUrls: Record<number, string>,
  ) {}

  public async listUsers(filters: UserFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.status === 'active') {
      where.deletedAt = null;
      where.lockedUntil = null;
    } else if (filters.status === 'locked') {
      where.deletedAt = null;
      where.lockedUntil = { not: null };
    } else if (filters.status === 'deleted') {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.billingStatus) {
      where.subscription = { status: filters.billingStatus };
    }

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[filters.sortBy ?? 'createdAt'] = filters.sortOrder ?? 'desc';

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { subscription: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toAdminUserDto(user)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async updateUser(userId: string, updates: AdminUserUpdate, adminUserId: string): Promise<AdminUserDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }

    const updateData: Record<string, unknown> = {};

    if (updates.role !== undefined) {
      updateData.role = updates.role;
    }

    if (updates.lockedUntil !== undefined) {
      updateData.lockedUntil = updates.lockedUntil;
    }

    if (updates.deletedAt !== undefined) {
      updateData.deletedAt = updates.deletedAt;
    }

    const [updatedUser] = await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: { subscription: true },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'admin.user.update',
          resourceType: 'user',
          resourceId: userId,
          details: { updates, previousRole: user.role },
          ipAddress: null,
          userAgent: null,
          requestId: null,
        },
      }),
    ]);

    if (updates.role !== undefined && updates.role !== user.role && user.subscription) {
      await this.prisma.subscription.update({
        where: { userId },
        data: { plan: updates.role === 'institutional' ? 'institutional' : updates.role },
      });
    }

    if (updates.lockedUntil !== null && user.deletedAt === null) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return this.toAdminUserDto(updatedUser);
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const [databaseHealth, redisHealth, chainHealths, workerStatuses] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkChainHealths(),
      this.checkWorkerStatuses(),
    ]);

    const memoryUsage = process.memoryUsage();
    const memoryUsageMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return {
      database: databaseHealth,
      redis: redisHealth,
      chains: chainHealths,
      workers: workerStatuses,
      system: {
        uptimeSeconds: process.uptime(),
        memoryUsageMb,
      },
    };
  }

  public async getSystemConfig(): Promise<SystemConfigDTO[]> {
    const configs = await this.prisma.systemConfig.findMany();

    return configs.map((config) => ({
      key: config.key,
      value: config.value,
      description: config.description,
      updatedAt: config.updatedAt?.toISOString() ?? new Date().toISOString(),
      updatedBy: config.updatedBy,
    }));
  }

  public async updateSystemConfig(key: string, value: unknown, adminUserId: string, reason: string): Promise<void> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key } });

    if (!config) {
      throw new ApiError(404, 'NOT_FOUND', `Configuration key '${key}' not found`);
    }

    const validation = RUNTIME_CONFIG_KEYS[key];
    if (validation) {
      if (validation.type === 'number' && typeof value !== 'number') {
        throw new ApiError(400, 'INVALID_CONFIG', `Invalid value for key '${key}': expected number`);
      }
      if (validation.type === 'boolean' && typeof value !== 'boolean') {
        throw new ApiError(400, 'INVALID_CONFIG', `Invalid value for key '${key}': expected boolean`);
      }
      if (validation.type === 'number' && validation.min !== undefined && (value as number) < validation.min) {
        throw new ApiError(400, 'INVALID_CONFIG', `Invalid value for key '${key}': minimum is ${validation.min}`);
      }
      if (validation.type === 'number' && validation.max !== undefined && (value as number) > validation.max) {
        throw new ApiError(400, 'INVALID_CONFIG', `Invalid value for key '${key}': maximum is ${validation.max}`);
      }
    }

    await this.prisma.systemConfig.update({
      where: { key },
      data: { value, updatedBy: adminUserId },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'admin.config.update',
        resourceType: 'system_config',
        resourceId: key,
        details: { key, value, reason, previousValue: config.value },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      },
    });

    await this.redis.publish('fr:config:changed', JSON.stringify({ key, value }));
  }

  public async impersonateUser(adminUserId: string, targetUserId: string): Promise<{ accessToken: string }> {
    const adminUser = await this.prisma.user.findUnique({ where: { id: adminUserId } });

    if (!adminUser || adminUser.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'Admin user not found');
    }

    if (adminUser.role !== 'admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Admin access required');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { subscription: true },
    });

    if (!targetUser || targetUser.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'Target user not found');
    }

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'admin.impersonate',
        resourceType: 'user',
        resourceId: targetUserId,
        details: { targetEmail: targetUser.email, targetRole: targetUser.role },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      },
    });

    const now = new Date();
    const payload = {
      sub: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      impersonatedBy: adminUserId,
      scope: 'support_impersonation',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + 300,
    };

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(
      createHmac('sha256', this.jwtSecret).update(`${header}.${payloadEncoded}`).digest(),
    );

    return { accessToken: `${header}.${payloadEncoded}.${signature}` };
  }

  public async pauseExecution(adminUserId: string, reason: string): Promise<void> {
    await this.updateSystemConfig('execution_paused', true, adminUserId, reason);

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'admin.execution.pause',
        resourceType: 'system',
        resourceId: null,
        details: { reason },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      },
    });
  }

  public async resumeExecution(adminUserId: string): Promise<void> {
    await this.updateSystemConfig('execution_paused', false, adminUserId, 'Execution resumed');

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'admin.execution.resume',
        resourceType: 'system',
        resourceId: null,
        details: {},
        ipAddress: null,
        userAgent: null,
        requestId: null,
      },
    });
  }

  public async listQueues(): Promise<QueueInfo[]> {
    const queueNames = ['email', 'execution', 'notifications', 'cleanup'];
    const queues: QueueInfo[] = [];

    for (const name of queueNames) {
      const activeKey = `bull:${name}:active`;
      const delayedKey = `bull:${name}:delayed`;
      const failedKey = `bull:${name}:failed`;
      const pausedKey = `bull:${name}:paused`;

      const [activeCount, delayedCount, failedCount, pausedVal] = await Promise.all([
        this.redis.get(activeKey).then((v) => (v ? parseInt(v, 10) : 0)),
        this.redis.get(delayedKey).then((v) => (v ? parseInt(v, 10) : 0)),
        this.redis.get(failedKey).then((v) => (v ? parseInt(v, 10) : 0)),
        this.redis.get(pausedKey),
      ]);

      queues.push({
        name,
        active: activeCount,
        delayed: delayedCount,
        failed: failedCount,
        paused: pausedVal === '1',
      });
    }

    return queues;
  }

  private async checkDatabaseHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw<{ result: number }[]>({ raw: 'SELECT 1' });
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }

  private async checkRedisHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }

  private async checkChainHealths(): Promise<Record<number, { status: 'healthy' | 'degraded' | 'unhealthy'; latestBlock?: number; blocksBehind?: number; latencyMs?: number }>> {
    const chainResults: Record<number, { status: 'healthy' | 'degraded' | 'unhealthy'; latestBlock?: number; blocksBehind?: number; latencyMs?: number }> = {};

    const chainIds = Object.keys(this.supportedChainRpcUrls).map(Number);

    const results = await Promise.allSettled(
      chainIds.map(async (chainId) => {
        const rpcUrl = this.supportedChainRpcUrls[chainId];
        const start = Date.now();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            return { chainId, status: 'unhealthy' as const, latencyMs: Date.now() - start };
          }

          const data = (await response.json()) as { result?: string };
          const latestBlock = data.result ? parseInt(data.result, 2) : 0;

          return {
            chainId,
            status: 'healthy' as const,
            latestBlock,
            blocksBehind: 0,
            latencyMs: Date.now() - start,
          };
        } catch {
          return { chainId, status: 'unhealthy' as const, latencyMs: Date.now() - start };
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { chainId, status, latestBlock, blocksBehind, latencyMs } = result.value;
        chainResults[chainId] = { status, latestBlock, blocksBehind, latencyMs };
      }
    }

    return chainResults;
  }

  private async checkWorkerStatuses(): Promise<Record<string, { status: 'running' | 'stopped' | 'unknown'; lastHeartbeat?: string }>> {
    const workerNames = ['execution-worker', 'monitor-worker', 'cleanup-worker'];
    const statuses: Record<string, { status: 'running' | 'stopped' | 'unknown'; lastHeartbeat?: string }> = {};

    const results = await Promise.allSettled(
      workerNames.map(async (name) => {
        const heartbeatKey = `fr:heartbeat:${name}`;
        const heartbeat = await this.redis.get(heartbeatKey);
        return { name, heartbeat };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { name, heartbeat } = result.value;
        if (heartbeat) {
          const heartbeatTime = new Date(heartbeat);
          const isRecent = Date.now() - heartbeatTime.getTime() < 60000;
          statuses[name] = {
            status: isRecent ? 'running' : 'stopped',
            lastHeartbeat: heartbeat,
          };
        } else {
          statuses[name] = { status: 'unknown' };
        }
      } else {
        const name = result.reason?.name ?? 'unknown';
        statuses[name] = { status: 'unknown' };
      }
    }

    return statuses;
  }

  private toAdminUserDto(user: any): AdminUserDTO {
    const toISOString = (value: any) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (typeof value.toISOString === 'function') return value.toISOString();
      return null;
    };
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      lockedUntil: toISOString(user.lockedUntil),
      createdAt: toISOString(user.createdAt),
      updatedAt: toISOString(user.updatedAt),
      deletedAt: toISOString(user.deletedAt),
      subscription: user.subscription
        ? {
            plan: user.subscription.plan,
            status: user.subscription.status,
            currentPeriodEnd: toISOString(user.subscription.currentPeriodEnd),
          }
        : null,
    };
  }
}
