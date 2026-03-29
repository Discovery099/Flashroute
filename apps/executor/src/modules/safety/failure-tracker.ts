import type { Redis } from 'ioredis';

const PAUSE_KEY_PREFIX = 'fr:pause:';
const PAUSE_TTL_SECONDS = 86400;

const MAX_CONSECUTIVE_FAILURES = parseInt(process.env.EXECUTOR_MAX_CONSECUTIVE_FAILURES ?? '5', 10);
const MAX_CONSECUTIVE_DRIFT = parseInt(process.env.EXECUTOR_MAX_CONSECUTIVE_DRIFT ?? '3', 10);
const DRIFT_LOSS_THRESHOLD_USD = parseInt(process.env.EXECUTOR_DRIFT_LOSS_THRESHOLD_USD ?? '10', 10);

export interface ChainFailureState {
  consecutiveFailures: number;
  consecutiveDrift: number;
  isPaused: boolean;
  pausedAt?: string;
  reason?: string;
}

export class FailureTracker {
  private readonly cache = new Map<number, ChainFailureState>();

  constructor(private readonly redis: Redis) {}

  async record(chainId: number, result: 'included' | 'reverted' | 'failed'): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    const state: ChainFailureState = existing
      ? JSON.parse(existing)
      : this.cache.get(chainId) ?? this.emptyState();

    if (result === 'included') {
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        state.isPaused = true;
        state.pausedAt = new Date().toISOString();
        state.reason = 'consecutive_failures';
      }
    }

    this.cache.set(chainId, state);
    await this.persist(key, state);
  }

  async recordDrift(chainId: number, actualProfit: bigint): Promise<void> {
    const lossThreshold = BigInt(DRIFT_LOSS_THRESHOLD_USD * 1_000_000);
    if (actualProfit >= 0n || actualProfit >= -lossThreshold) {
      return;
    }

    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const state = this.cache.get(chainId) ?? this.emptyState();

    state.consecutiveDrift += 1;
    if (state.consecutiveDrift >= MAX_CONSECUTIVE_DRIFT) {
      state.isPaused = true;
      state.pausedAt = new Date().toISOString();
      state.reason = 'consecutive_drift';
    }

    this.cache.set(chainId, state);
    await this.persist(key, state);
  }

  async recordNonNegativeProfit(chainId: number): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    const state: ChainFailureState = existing
      ? JSON.parse(existing)
      : this.cache.get(chainId) ?? this.emptyState();
    state.consecutiveDrift = 0;
    this.cache.set(chainId, state);
    await this.persist(key, state);
  }

  async resume(chainId: number): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    this.cache.delete(chainId);
    await this.redis.del(key);
  }

  getState(chainId: number): ChainFailureState {
    if (this.cache.has(chainId)) {
      return this.cache.get(chainId)!;
    }
    return this.emptyState();
  }

  async recoverFromRedis(): Promise<Map<number, ChainFailureState>> {
    const pausedChains = new Map<number, ChainFailureState>();
    const keys = await this.redis.keys(`${PAUSE_KEY_PREFIX}*`);
    for (const key of keys) {
      const chainId = parseInt(key.replace(PAUSE_KEY_PREFIX, ''), 10);
      if (isNaN(chainId)) continue;
      const state = await this.getStateAsync(chainId);
      if (state.isPaused) {
        pausedChains.set(chainId, state);
      }
    }
    return pausedChains;
  }

  private async getStateAsync(chainId: number): Promise<ChainFailureState> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    if (!existing) return this.emptyState();
    return JSON.parse(existing);
  }

  private async persist(key: string, state: ChainFailureState): Promise<void> {
    await this.redis.set(key, JSON.stringify(state), 'EX', PAUSE_TTL_SECONDS);
  }

  private emptyState(): ChainFailureState {
    return {
      consecutiveFailures: 0,
      consecutiveDrift: 0,
      isPaused: false,
    };
  }
}
