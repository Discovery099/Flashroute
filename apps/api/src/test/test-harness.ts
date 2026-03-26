import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { buildApiApp } from '../app';
import {
  OpportunitiesService,
  RedisOpportunitiesRepository,
  type DashboardPeriodShell,
} from '../modules/opportunities/opportunities.service';
import {
  PrismaAuthRepository,
  RedisEmailJobQueue,
  RedisEphemeralAuthStore,
  RedisRateLimitStore,
  type EmailJob,
  type PrismaClientLike,
  type RedisClientLike,
  type UserRecord,
} from '../modules/auth/auth.repository';
import { PrismaStrategiesRepository } from '../modules/strategies/strategies.repository';
import { PrismaTradesRepository } from '../modules/trades/trades.repository';
import { TradesService } from '../modules/trades/trades.service';
import { PrismaAlertsRepository } from '../modules/alerts/alerts.repository';
import { AlertsService } from '../modules/alerts/alerts.service';
import { AnalyticsRepository } from '../modules/analytics/analytics.repository';
import { AnalyticsService } from '../modules/analytics/analytics.service';
import type { OpportunityView } from '@flashroute/shared/contracts/opportunity';

type SortDirection = 'asc' | 'desc';

const sortByCreatedAt = <T extends { createdAt: Date }>(records: T[], direction: SortDirection) =>
  [...records].sort((left, right) =>
    direction === 'asc'
      ? left.createdAt.getTime() - right.createdAt.getTime()
      : right.createdAt.getTime() - left.createdAt.getTime(),
  );

class FakeRedisClient implements RedisClientLike {
  private readonly values = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly lists = new Map<string, string[]>();
  private readonly sortedSets = new Map<string, Array<{ score: number; member: string }>>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly emitter = new EventEmitter();
  private readonly zrangeReads = new Map<string, number>();

  private purgeExpired(key: string) {
    const record = this.values.get(key);
    if (record && record.expiresAt !== null && record.expiresAt <= Date.now()) {
      this.values.delete(key);
    }
  }

  public async get(key: string): Promise<string | null> {
    this.purgeExpired(key);
    return this.values.get(key)?.value ?? null;
  }

  public async setex(key: string, ttlSeconds: number, value: string): Promise<unknown> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return 'OK';
  }

  public async del(key: string): Promise<number> {
    const hadValue = this.values.delete(key);
    return hadValue ? 1 : 0;
  }

  public async incr(key: string): Promise<number> {
    this.purgeExpired(key);
    const current = Number(this.values.get(key)?.value ?? '0') + 1;
    const expiresAt = this.values.get(key)?.expiresAt ?? null;
    this.values.set(key, { value: String(current), expiresAt });
    return current;
  }

  public async expire(key: string, ttlSeconds: number): Promise<number> {
    this.purgeExpired(key);
    const record = this.values.get(key);
    if (!record) {
      return 0;
    }
    this.values.set(key, { ...record, expiresAt: Date.now() + ttlSeconds * 1000 });
    return 1;
  }

  public async ttl(key: string): Promise<number> {
    this.purgeExpired(key);
    const record = this.values.get(key);
    if (!record) {
      return -2;
    }
    if (record.expiresAt === null) {
      return -1;
    }
    return Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  }

  public async rpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const normalizedStop = stop < 0 ? list.length - 1 : stop;
    return list.slice(start, normalizedStop + 1);
  }

  public async zadd(key: string, score: number, member: string): Promise<number> {
    const set = this.sortedSets.get(key) ?? [];
    const withoutExisting = set.filter((entry) => entry.member !== member);
    withoutExisting.push({ score, member });
    this.sortedSets.set(key, withoutExisting);
    return 1;
  }

  public async zrange(key: string, start: number, stop: number, rev?: 'REV'): Promise<string[]> {
    this.zrangeReads.set(key, (this.zrangeReads.get(key) ?? 0) + 1);
    const sorted = [...(this.sortedSets.get(key) ?? [])].sort((left, right) =>
      rev === 'REV' ? right.score - left.score : left.score - right.score,
    );
    const normalizedStop = stop < 0 ? sorted.length - 1 : stop;
    return sorted.slice(start, normalizedStop + 1).map((entry) => entry.member);
  }

  public async zrem(key: string, ...members: string[]): Promise<number> {
    const set = this.sortedSets.get(key) ?? [];
    const next = set.filter((entry) => !members.includes(entry.member));
    this.sortedSets.set(key, next);
    return set.length - next.length;
  }

  public async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    for (const member of members) {
      set.add(member);
    }
    this.sets.set(key, set);
    return set.size;
  }

  public async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  public async publish(channel: string, payload: string): Promise<number> {
    this.emitter.emit('pmessage', 'opportunities:*', channel, payload);
    return 1;
  }

  public async psubscribe(_pattern: string): Promise<void> {}

  public async punsubscribe(_pattern: string): Promise<void> {}

  public on(event: 'pmessage', listener: (pattern: string, channel: string, payload: string) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  public off(event: 'pmessage', listener: (pattern: string, channel: string, payload: string) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  public getZrangeReadCount(key: string): number {
    return this.zrangeReads.get(key) ?? 0;
  }
}

class FakePrismaClient implements PrismaClientLike {
  public readonly users: any[] = [];
  public readonly refreshTokens: any[] = [];
  public readonly emailVerificationTokens: any[] = [];
  public readonly passwordResetTokens: any[] = [];
  public readonly backupCodes: any[] = [];
  public readonly apiKeys: any[] = [];
  public readonly passwordHistoryRows: any[] = [];
  public readonly subscriptions: any[] = [];
  public readonly auditLogs: any[] = [];
  public readonly strategies: any[] = [];
  public readonly trades: any[] = [];
  public readonly tradeHops: any[] = [];
  public readonly competitorActivityData: any[] = [];
  public readonly alertRulesData: any[] = [];
  public readonly alertHistoryData: any[] = [];
  public readonly supportedChains: any[] = [
    { id: 1, chainId: 1, name: 'Ethereum', isActive: true, executorContractAddress: '0xexecutor-eth' },
    { id: 2, chainId: 42161, name: 'Arbitrum', isActive: true, executorContractAddress: '0xexecutor-arb' },
    { id: 3, chainId: 10, name: 'Optimism', isActive: true, executorContractAddress: '0xexecutor-op' },
    { id: 4, chainId: 137, name: 'Polygon', isActive: true, executorContractAddress: '0xexecutor-polygon' },
  ];

  public readonly user = {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
      this.users.find((user) => (where.id ? user.id === where.id : user.email === where.email)) ?? null,
    findMany: async ({ where, skip, take, orderBy }: { where?: any; skip?: number; take?: number; orderBy?: any }) => {
      let filtered = this.users.filter((user) => {
        if (!where) return true;
        for (const [key, value] of Object.entries(where)) {
          if (key === 'OR') {
            const orClauses = value as Array<Record<string, any>>;
            const matchesAny = orClauses.some((clause) => {
              return Object.entries(clause).every(([k, v]) => {
                if (typeof v === 'object' && v !== null && 'contains' in v) {
                  const userVal = String((user as any)[k] ?? '').toLowerCase();
                  return userVal.includes(String(v.contains).toLowerCase());
                }
                return (user as any)[k] === v;
              });
            });
            if (!matchesAny) return false;
          } else if (key === 'role' && user.role !== value) return false;
          else if (key === 'deletedAt' && value === null && user.deletedAt !== null) return false;
          else if (key === 'deletedAt' && value === undefined && user.deletedAt !== null) return false;
          else if (key === 'deletedAt' && value && (value as any).not === null && user.deletedAt === null) return false;
          else if (key === 'lockedUntil' && value && (value as any).not === null && user.lockedUntil === null) return false;
          else if (key === 'subscription') {
            const subFilter = value as { status?: string };
            const subscription = this.subscriptions.find((s) => s.userId === user.id);
            if (subFilter.status && subscription?.status !== subFilter.status) return false;
          }
        }
        return true;
      });
      if (orderBy) {
        const key = Object.keys(orderBy)[0];
        const dir = orderBy[key];
        filtered = [...filtered].sort((a, b) => {
          const aVal = a[key] instanceof Date ? a[key].getTime() : a[key];
          const bVal = b[key] instanceof Date ? b[key].getTime() : b[key];
          return dir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
        });
      }
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      return filtered.slice(start, end).map((user) => ({
        ...user,
        subscription: this.subscriptions.find((s) => s.userId === user.id) ?? null,
      }));
    },
    count: async ({ where }: { where?: any }) => {
      let filtered = this.users;
      if (where) {
        filtered = filtered.filter((user) => {
          for (const [key, value] of Object.entries(where)) {
            if (key === 'role' && user.role !== value) return false;
            if (key === 'deletedAt' && value === null && user.deletedAt !== null) return false;
            if (key === 'deletedAt' && value === undefined && user.deletedAt !== null) return false;
            if (key === 'deletedAt' && value && (value as any).not === null && user.deletedAt === null) return false;
            if (key === 'lockedUntil' && value && (value as any).not === null && user.lockedUntil === null) return false;
          }
          return true;
        });
      }
      return filtered.length;
    },
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        emailVerifiedAt: null,
        lastLoginAt: null,
        loginCount: 0,
        failedLoginCount: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        subscription: null,
        ...data,
      };
      this.users.push(record);
      return record;
    },
    update: async ({ where, data, include }: { where: { id: string }; data: any; include?: { subscription?: boolean } }) => {
      const record = this.users.find((user) => user.id === where.id);
      const dateFields = ['lockedUntil', 'deletedAt', 'emailVerifiedAt', 'lastLoginAt'];
      for (const field of dateFields) {
        if (field in data && typeof data[field] === 'string') {
          data[field] = new Date(data[field]);
        }
      }
      Object.assign(record, data, { updatedAt: new Date() });
      if (include?.subscription) {
        record.subscription = this.subscriptions.find((s) => s.userId === record.id) ?? null;
      }
      return record;
    },
  };

  public readonly refreshToken = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      this.refreshTokens.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { tokenHash?: string; id?: string } }) =>
      this.refreshTokens.find((token) => (where.id ? token.id === where.id : token.tokenHash === where.tokenHash)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.refreshTokens.find((token) => token.id === where.id);
      Object.assign(record, data);
      return record;
    },
    updateMany: async ({ where, data }: { where: any; data: any }) => {
      let count = 0;
      for (const record of this.refreshTokens) {
        const matches = Object.entries(where).every(([key, value]) => record[key] === value);
        if (matches) {
          Object.assign(record, data);
          count += 1;
        }
      }
      return { count };
    },
    findMany: async ({ where, orderBy }: { where: any; orderBy?: { createdAt: SortDirection } }) => {
      const filtered = this.refreshTokens.filter((record) =>
        Object.entries(where).every(([key, value]) => record[key] === value),
      );
      return orderBy ? sortByCreatedAt(filtered, orderBy.createdAt) : filtered;
    },
  };

  public readonly emailVerificationToken = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), usedAt: null, createdAt: new Date(), ...data };
      this.emailVerificationTokens.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      this.emailVerificationTokens.find((token) => token.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.emailVerificationTokens.find((token) => token.id === where.id);
      Object.assign(record, data);
      return record;
    },
    deleteMany: async ({ where }: { where: any }) => {
      const before = this.emailVerificationTokens.length;
      for (let index = this.emailVerificationTokens.length - 1; index >= 0; index -= 1) {
        const record = this.emailVerificationTokens[index]!;
        if (Object.entries(where).every(([key, value]) => record[key] === value)) {
          this.emailVerificationTokens.splice(index, 1);
        }
      }
      return { count: before - this.emailVerificationTokens.length };
    },
  };

  public readonly passwordResetToken = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), usedAt: null, createdAt: new Date(), ...data };
      this.passwordResetTokens.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      this.passwordResetTokens.find((token) => token.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.passwordResetTokens.find((token) => token.id === where.id);
      Object.assign(record, data);
      return record;
    },
    deleteMany: async ({ where }: { where: any }) => {
      const before = this.passwordResetTokens.length;
      for (let index = this.passwordResetTokens.length - 1; index >= 0; index -= 1) {
        const record = this.passwordResetTokens[index]!;
        if (Object.entries(where).every(([key, value]) => record[key] === value)) {
          this.passwordResetTokens.splice(index, 1);
        }
      }
      return { count: before - this.passwordResetTokens.length };
    },
  };

  public readonly twoFactorBackupCode = {
    createMany: async ({ data }: { data: any[] }) => {
      for (const row of data) {
        this.backupCodes.push({ id: randomUUID(), usedAt: null, createdAt: new Date(), ...row });
      }
      return { count: data.length };
    },
    findMany: async ({ where, orderBy }: { where: any; orderBy?: { createdAt: SortDirection } }) => {
      const filtered = this.backupCodes.filter((record) => Object.entries(where).every(([key, value]) => record[key] === value));
      return orderBy ? sortByCreatedAt(filtered, orderBy.createdAt) : filtered;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.backupCodes.find((code) => code.id === where.id);
      Object.assign(record, data);
      return record;
    },
    deleteMany: async ({ where }: { where: any }) => {
      const before = this.backupCodes.length;
      for (let index = this.backupCodes.length - 1; index >= 0; index -= 1) {
        const record = this.backupCodes[index]!;
        if (Object.entries(where).every(([key, value]) => record[key] === value)) {
          this.backupCodes.splice(index, 1);
        }
      }
      return { count: before - this.backupCodes.length };
    },
  };

  public readonly apiKey = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data };
      this.apiKeys.push(record);
      return record;
    },
    findMany: async ({ where, orderBy }: { where: any; orderBy?: { createdAt: SortDirection } }) => {
      const filtered = this.apiKeys.filter((record) => Object.entries(where).every(([key, value]) => record[key] === value));
      return orderBy ? sortByCreatedAt(filtered, orderBy.createdAt) : filtered;
    },
    findFirst: async ({ where }: { where: any }) =>
      this.apiKeys.find((record) => Object.entries(where).every(([key, value]) => record[key] === value)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.apiKeys.find((key) => key.id === where.id);
      Object.assign(record, data);
      return record;
    },
  };

  public readonly passwordHistory = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      this.passwordHistoryRows.push(record);
      return record;
    },
    findMany: async ({ where, orderBy, take }: { where: any; orderBy?: { createdAt: SortDirection }; take?: number }) => {
      const filtered = this.passwordHistoryRows.filter((record) =>
        Object.entries(where).every(([key, value]) => record[key] === value),
      );
      const sorted = orderBy ? sortByCreatedAt(filtered, orderBy.createdAt) : filtered;
      return take === undefined ? sorted : sorted.slice(0, take);
    },
  };

  public readonly auditLog = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      this.auditLogs.push(record);
      return record;
    },
  };

  public readonly subscription = {
    update: async ({ where, data }: { where: { userId: string }; data: any }) => {
      const sub = this.subscriptions.find((s) => s.userId === where.userId);
      if (sub) {
        Object.assign(sub, data);
      }
      return sub;
    },
  };

  public readonly systemConfig = {
    findMany: async () => this.systemConfigs,
    findUnique: async ({ where }: { where: { key: string } }) =>
      this.systemConfigs.find((c) => c.key === where.key) ?? null,
    update: async ({ where, data }: { where: { key: string }; data: any }) => {
      const config = this.systemConfigs.find((c) => c.key === where.key);
      if (config) {
        Object.assign(config, data, { updatedAt: new Date() });
      }
      return config;
    },
  };

  public readonly systemConfigs: any[] = [
    { id: 1, key: 'global_min_profit_usd', value: 10, description: 'Global min profit', updatedAt: new Date(), updatedBy: null },
    { id: 2, key: 'max_concurrent_executions', value: 1, description: 'Max concurrent executions', updatedAt: new Date(), updatedBy: null },
    { id: 3, key: 'mempool_monitoring_enabled', value: true, description: 'Enable mempool monitoring', updatedAt: new Date(), updatedBy: null },
    { id: 4, key: 'profit_sweep_enabled', value: true, description: 'Enable profit sweep', updatedAt: new Date(), updatedBy: null },
    { id: 5, key: 'new_registration_enabled', value: true, description: 'Allow new registrations', updatedAt: new Date(), updatedBy: null },
    { id: 6, key: 'maintenance_mode', value: false, description: 'Maintenance mode', updatedAt: new Date(), updatedBy: null },
    { id: 7, key: 'execution_paused', value: false, description: 'Execution paused', updatedAt: new Date(), updatedBy: null },
  ];

  public readonly supportedChain = {
    findUnique: async ({ where }: { where: { chainId: number } }) =>
      this.supportedChains.find((chain) => chain.chainId === where.chainId) ?? null,
  };

  public readonly strategy = {
    count: async ({ where }: { where: any }) =>
      this.strategies.filter((record) => Object.entries(where).every(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'contains' in value) {
          return String(record[key]).toLowerCase().includes(String((value as any).contains).toLowerCase());
        }
        return record[key] === value;
      })).length,
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        isActive: false,
        description: data.description ?? '',
        minProfitUsd: data.minProfitUsd ?? 10,
        maxTradeSizeUsd: data.maxTradeSizeUsd ?? 100000,
        maxHops: data.maxHops ?? 4,
        maxSlippageBps: data.maxSlippageBps ?? 100,
        cooldownSeconds: data.cooldownSeconds ?? 0,
        allowedDexes: data.allowedDexes ?? ['uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer'],
        flashLoanProvider: data.flashLoanProvider ?? 'auto',
        useFlashbots: data.useFlashbots ?? true,
        maxGasPriceGwei: data.maxGasPriceGwei ?? 100,
        riskBufferPct: data.riskBufferPct ?? 0.5,
        useDemandPrediction: data.useDemandPrediction ?? true,
        executionCount: 0,
        totalProfitUsd: 0,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.strategies.push(record);
      return { ...record, chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null };
    },
    findFirst: async ({ where }: { where: any }) => {
      const record = this.strategies.find((candidate) => Object.entries(where).every(([key, value]) => candidate[key] === value));
      return record ? { ...record, chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null } : null;
    },
    findMany: async ({ where, skip = 0, take }: { where: any; skip?: number; take?: number }) => {
      const filtered = this.strategies.filter((candidate) => Object.entries(where).every(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'contains' in value) {
          return String(candidate[key]).toLowerCase().includes(String((value as any).contains).toLowerCase());
        }
        return candidate[key] === value;
      }));
      const sliced = take === undefined ? filtered.slice(skip) : filtered.slice(skip, skip + take);
      return sliced.map((record) => ({ ...record, chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null }));
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.strategies.find((candidate) => candidate.id === where.id)!;
      Object.assign(record, data, { updatedAt: new Date() });
      return { ...record, chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.strategies.findIndex((candidate) => candidate.id === where.id);
      const [deleted] = this.strategies.splice(index, 1);
      return deleted;
    },
  };

  public readonly trade = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        status: data.status ?? 'detected',
        txHash: data.txHash ?? null,
        blockNumber: data.blockNumber ?? null,
        routePath: data.routePath ?? [],
        routeHops: data.routeHops ?? 0,
        flashLoanProvider: data.flashLoanProvider ?? 'auto',
        flashLoanToken: data.flashLoanToken ?? '0x0000000000000000000000000000000000000000',
        flashLoanAmount: data.flashLoanAmount ?? 0,
        flashLoanFee: data.flashLoanFee ?? 0,
        profitRaw: data.profitRaw ?? null,
        profitUsd: data.profitUsd ?? null,
        gasUsed: data.gasUsed ?? null,
        gasPriceGwei: data.gasPriceGwei ?? null,
        gasCostUsd: data.gasCostUsd ?? null,
        netProfitUsd: data.netProfitUsd ?? null,
        simulatedProfitUsd: data.simulatedProfitUsd ?? 0,
        slippagePct: data.slippagePct ?? null,
        demandPredictionUsed: data.demandPredictionUsed ?? false,
        competingTxsInBlock: data.competingTxsInBlock ?? null,
        errorMessage: data.errorMessage ?? null,
        executionTimeMs: data.executionTimeMs ?? 0,
        submittedAt: data.submittedAt ?? null,
        confirmedAt: data.confirmedAt ?? null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.trades.push(record);
      return {
        ...record,
        chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null,
        strategy: { id: record.strategyId, name: 'Test Strategy' },
      };
    },
    findFirst: async ({ where }: { where: any }) => {
      const record = this.trades.find((candidate) => {
        return Object.entries(where).every(([key, value]) => {
          if (where.include?.chain && key === 'id') {
            return candidate[key] === value;
          }
          if (typeof value === 'object' && value !== null && 'gte' in (value as object)) {
            return candidate[key] >= (value as { gte: number }).gte;
          }
          if (typeof value === 'object' && value !== null && 'lte' in (value as object)) {
            return candidate[key] <= (value as { lte: number }).lte;
          }
          return candidate[key] === value;
        });
      });
      if (!record) {
        return null;
      }
      return {
        ...record,
        chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null,
        strategy: { id: record.strategyId, name: 'Test Strategy' },
      };
    },
    findMany: async ({ where, skip = 0, take, orderBy }: { where: any; skip?: number; take?: number; orderBy?: any }) => {
      let filtered = this.trades.filter((candidate) => {
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'gte' in (value as object)) {
            return candidate[key] >= (value as { gte: number }).gte;
          }
          if (typeof value === 'object' && value !== null && 'lte' in (value as object)) {
            return candidate[key] <= (value as { lte: number }).lte;
          }
          if (typeof value === 'object' && value !== null && 'in' in (value as object)) {
            return (value as { in: unknown[] }).in.includes(candidate[key]);
          }
          return candidate[key] === value;
        });
      });

      if (orderBy) {
        const sortKey = Object.keys(orderBy)[0];
        const sortDir = orderBy[sortKey];
        filtered = [...filtered].sort((a, b) => {
          if (sortDir === 'asc') {
            return a[sortKey] > b[sortKey] ? 1 : -1;
          }
          return a[sortKey] < b[sortKey] ? 1 : -1;
        });
      }

      const sliced = take === undefined ? filtered.slice(skip) : filtered.slice(skip, skip + take);
      return sliced.map((record) => ({
        ...record,
        chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null,
        strategy: { id: record.strategyId, name: 'Test Strategy' },
      }));
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.trades.find((candidate) => candidate.id === where.id)!;
      Object.assign(record, data, { updatedAt: new Date() });
      return {
        ...record,
        chain: this.supportedChains.find((chain) => chain.chainId === record.chainId) ?? null,
        strategy: { id: record.strategyId, name: 'Test Strategy' },
      };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const index = this.trades.findIndex((candidate) => candidate.id === where.id);
      const [deleted] = this.trades.splice(index, 1);
      return deleted;
    },
  };

  public readonly tradeHop = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        createdAt: now,
        ...data,
      };
      this.tradeHops.push(record);
      return {
        ...record,
        pool: { id: record.poolId, address: '0xpool', dex: 'uniswap_v3' },
        tokenIn: { id: record.tokenInId, symbol: 'WETH', decimals: 18 },
        tokenOut: { id: record.tokenOutId, symbol: 'USDC', decimals: 6 },
      };
    },
    findMany: async ({ where }: { where: { tradeId: string } }) => {
      return this.tradeHops
        .filter((hop) => hop.tradeId === where.tradeId)
        .map((hop) => ({
          ...hop,
          pool: { id: hop.poolId, address: '0xpool', dex: 'uniswap_v3' },
          tokenIn: { id: hop.tokenInId, symbol: 'WETH', decimals: 18 },
          tokenOut: { id: hop.tokenOutId, symbol: 'USDC', decimals: 6 },
        }));
    },
  };

  public readonly competitorActivity = {
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      const rows = this.competitorActivityData;
      return rows;
    },
  };

  public readonly alertRule = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        type: data.type,
        chainId: data.chainId ?? null,
        strategyId: data.strategyId ?? null,
        thresholdValue: data.thresholdValue ?? null,
        deliveryChannel: data.deliveryChannel ?? 'DASHBOARD',
        deliveryConfig: data.deliveryConfig ?? {},
        isActive: data.isActive ?? true,
        lastTriggeredAt: null,
        triggerCount: 0,
        cooldownSeconds: data.cooldownSeconds ?? 60,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.alertRulesData.push(record);
      return record;
    },
    findFirst: async ({ where }: { where: any }) =>
      this.alertRulesData.find((record) => Object.entries(where).every(([key, value]) => {
        if (key === 'userId') return record.userId === value;
        if (key === 'id') return record.id === value;
        if (key === 'isActive') return record.isActive === value;
        return record[key] === value;
      })) ?? null,
    findMany: async ({ where, skip = 0, take, orderBy }: { where: any; skip?: number; take?: number; orderBy?: any }) => {
      let filtered = this.alertRulesData.filter((record) => Object.entries(where).every(([key, value]) => {
        if (key === 'userId' && where.userId) return record.userId === where.userId;
        if (key === 'type' && where.type) return record.type === where.type;
        if (key === 'isActive' && where.isActive !== undefined) return record.isActive === where.isActive;
        if (key === 'id') return record.id === value;
        return true;
      }));
      if (orderBy) {
        const sortKey = Object.keys(orderBy)[0];
        const sortDir = orderBy[sortKey];
        filtered = [...filtered].sort((a, b) => {
          if (sortDir === 'asc') {
            return a[sortKey] > b[sortKey] ? 1 : -1;
          }
          return a[sortKey] < b[sortKey] ? 1 : -1;
        });
      }
      const sliced = take === undefined ? filtered.slice(skip) : filtered.slice(skip, skip + take);
      return sliced;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const record = this.alertRulesData.find((candidate) => candidate.id === where.id)!;
      Object.assign(record, data, { updatedAt: new Date() });
      return record;
    },
    count: async ({ where }: { where: any }) => {
      return this.alertRulesData.filter((record) => {
        if (where.userId && record.userId !== where.userId) return false;
        if (where.isActive !== undefined && record.isActive !== where.isActive) return false;
        return true;
      }).length;
    },
  };

  public readonly alertHistory = {
    create: async ({ data }: { data: any }) => {
      const now = new Date();
      const record = {
        id: randomUUID(),
        alertId: data.alertId,
        userId: data.userId,
        tradeId: data.tradeId ?? null,
        message: data.message,
        deliveryStatus: data.deliveryStatus ?? 'PENDING',
        deliveredAt: data.deliveredAt ?? null,
        errorMessage: data.errorMessage ?? null,
        createdAt: now,
        ...data,
      };
      this.alertHistoryData.push(record);
      return record;
    },
    findMany: async ({ where, skip = 0, take, orderBy }: { where: any; skip?: number; take?: number; orderBy?: any }) => {
      let filtered = this.alertHistoryData.filter((record) => {
        if (where.alertId && record.alertId !== where.alertId) return false;
        if (where.userId && record.userId !== where.userId) return false;
        return true;
      });
      if (orderBy) {
        const sortKey = Object.keys(orderBy)[0];
        const sortDir = orderBy[sortKey];
        filtered = [...filtered].sort((a, b) => {
          if (sortDir === 'asc') {
            return a[sortKey] > b[sortKey] ? 1 : -1;
          }
          return a[sortKey] < b[sortKey] ? 1 : -1;
        });
      }
      const sliced = take === undefined ? filtered.slice(skip) : filtered.slice(skip, skip + take);
      return sliced;
    },
    count: async ({ where }: { where: any }) => {
      return this.alertHistoryData.filter((record) => {
        if (where.alertId && record.alertId !== where.alertId) return false;
        if (where.userId && record.userId !== where.userId) return false;
        return true;
      }).length;
    },
  };
}

export const createTestApiHarness = async () => {
  const prisma = new FakePrismaClient();
  const redis = new FakeRedisClient();
  const opportunitiesRepository = new RedisOpportunitiesRepository(redis as never);
  const opportunitiesService = new OpportunitiesService(
    opportunitiesRepository,
    () => new Date('2026-03-22T12:00:00.000Z').getTime(),
  );

  const authRepository = new PrismaAuthRepository(prisma);
  const strategiesRepository = new PrismaStrategiesRepository(prisma as never);
  const tradesRepository = new PrismaTradesRepository(prisma as never);
  const tradesService = new TradesService(tradesRepository);
  const alertsRepository = new PrismaAlertsRepository(prisma as never);
  const alertsService = new AlertsService(authRepository, alertsRepository);
  const ephemeralAuthStore = new RedisEphemeralAuthStore(redis, 'fr:');
  const emailQueue = new RedisEmailJobQueue(redis, 'fr:queue:email');
  const rateLimitStore = new RedisRateLimitStore(redis, 'fr:');
  const analyticsRepository = new AnalyticsRepository(prisma as never);
  const analyticsService = new AnalyticsService(analyticsRepository, 'https://eth.llamarpc.com');

  const app = buildApiApp({
    authRepository,
    strategiesRepository,
    tradesRepository,
    alertsRepository,
    ephemeralAuthStore,
    emailQueue,
    rateLimitStore,
    opportunitiesCache: redis as never,
    strategyEventPublisher: redis as never,
    livePubSubSubscriber: redis as never,
    auth: {
      jwtSecret: '12345678901234567890123456789012',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604800,
      bcryptRounds: 4,
      refreshTokenPepper: 'pepper',
      apiKeyPepper: 'api-pepper',
    },
    opportunitiesService,
    tradesService,
    alertsService,
    analyticsRepository,
    analyticsService,
  });

  await app.ready();

  return {
    app,
    prisma,
    redis,
    getUserByEmail: (email: string) => prisma.users.find((user) => user.email === email) as UserRecord | undefined,
    getUserById: (userId: string) => prisma.users.find((user) => user.id === userId) as UserRecord | undefined,
    listRefreshTokensByEmail: (email: string) => {
      const user = prisma.users.find((candidate) => candidate.email === email);
      if (!user) {
        return [];
      }
      const tokens = prisma.refreshTokens
        .filter((token) => token.userId === user.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const latestFamilyId = tokens.at(-1)?.familyId;
      return latestFamilyId ? tokens.filter((token) => token.familyId === latestFamilyId) : [];
    },
    getQueuedEmailJobs: async () => (await redis.lrange('fr:queue:email', 0, -1)).map((value) => JSON.parse(value) as EmailJob),
    seedOpportunities: async (chainId: number, opportunities: OpportunityView[]) => {
      for (const opportunity of opportunities) {
        await opportunitiesRepository.save({
          ...opportunity,
          chainId,
          hops: opportunity.hops ?? opportunity.routePath.length,
        });
      }
    },
    publishOpportunityUpdate: async (chainId: number, opportunity: OpportunityView) => {
      await redis.publish(`opportunities:${chainId}`, JSON.stringify({ type: 'opportunity', data: opportunity }));
    },
    publishTradeLive: async (trade: {
      id: string;
      executedAt: string;
      route: string;
      netProfitUsd: number;
      gasCostUsd: number;
      status: string;
      txHash: string;
    }) => {
      await redis.publish('trades:live', JSON.stringify({ type: 'trade', data: trade }));
    },
    publishSystemAlert: async (alert: {
      id: string;
      severity: string;
      message: string;
      createdAt: string;
    }) => {
      await redis.publish('system:alerts', JSON.stringify({ type: 'alert', data: alert }));
    },
    getOpportunityRedisReadCount: (chainId: number) => redis.getZrangeReadCount(`fr:opportunities:${chainId}`),
    hasOpportunity: async (chainId: number, opportunityId: string) =>
      (await opportunitiesRepository.list(chainId)).some((opportunity) => opportunity.id === opportunityId),
    getDashboardStats: (period: DashboardPeriodShell['period'], chainId?: number): Promise<DashboardPeriodShell> =>
      opportunitiesService.getDashboardShell(period, chainId),
    setUserRole: (userId: string, role: UserRecord['role']) => {
      const user = prisma.users.find((candidate) => candidate.id === userId);
      if (user) {
        user.role = role;
      }
    },
    getApiKeysByUserId: (userId: string) => prisma.apiKeys.filter((key) => key.userId === userId),
    listStrategiesByUserId: (userId: string) => prisma.strategies.filter((strategy) => strategy.userId === userId),
    setSupportedChainExecutorContract: (chainId: number, executorContractAddress: string | null) => {
      const chain = prisma.supportedChains.find((candidate) => candidate.chainId === chainId);
      if (chain) {
        chain.executorContractAddress = executorContractAddress;
      }
    },
    setTwoFactorSecretForUser: (userId: string, twoFactorSecret: string) => {
      const user = prisma.users.find((candidate) => candidate.id === userId);
      if (user) {
        user.twoFactorEnabled = true;
        user.twoFactorSecret = twoFactorSecret;
      }
    },
    getRedisValue: (key: string) => redis.get(key),
    setSubscriptionForUser: (
      userId: string,
      input: { plan: string; status: string; currentPeriodEnd: Date; currentPeriodStart?: Date },
    ) => {
      const user = prisma.users.find((candidate) => candidate.id === userId);
      if (!user) {
        return;
      }
      const subscription = {
        id: randomUUID(),
        userId,
        plan: input.plan,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart ?? new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: input.currentPeriodEnd,
      };
      user.subscription = subscription;
      prisma.subscriptions.push(subscription);
    },
    listAuditActionsForUser: (email: string) => {
      const user = prisma.users.find((candidate) => candidate.email === email);
      if (!user) {
        return [] as string[];
      }
      return prisma.auditLogs.filter((log) => log.userId === user.id).map((log) => log.action);
    },
    findAuditLogByAction: (action: string) => prisma.auditLogs.find((log) => log.action === action),
  };
};
