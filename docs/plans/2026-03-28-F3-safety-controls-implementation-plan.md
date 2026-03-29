# F3 Safety Controls — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the safety control layer for the executor that fail-closes execution on health failures, consecutive reverts, drift, or admin pause — making live execution safe enough to enable.

**Architecture:** A `SafetyService` wraps `ExecutionEngine.execute()` with layered safety gates: admin global pause → health heartbeat check → per-chain auto-pause (failures + drift). A background `HealthMonitor` ticker (10s) keeps heartbeat freshness in memory. A `RuntimeConfigSubscriber` listens to `fr:config:changed` for `execution_paused` and `maintenance_mode`. All pause state is persisted to Redis and recovered on restart.

**Tech Stack:** ethers v6, ioredis, pino (via @flashroute/shared)

---

## Prerequisites

Before starting, verify:
- `packages/shared/src/constants.ts` — `REDIS_CHANNELS` (already confirmed: `routeDiscovered`, `tradesQueue`, `systemAlert`)
- `packages/shared/src/logger.ts` — `createLogger()`
- `apps/api/src/modules/admin/admin.service.ts` — publishes `fr:config:changed` with `{ key, value }` on SystemConfig updates (confirmed)
- `apps/executor/src/services/execution-engine.ts` — `ExecutionEngine` class with `execute()` and `shouldExecute()` (confirmed)
- `apps/executor/src/workers/executor.ts` — `ExecutorWorker` (confirmed)

Also verify `fr:system:alert` channel exists in `REDIS_CHANNELS`:
```typescript
// packages/shared/src/constants.ts should have:
executionResult: 'fr:execution:result',
systemAlert: 'fr:system:alert',  // confirm this exists
```

If `systemAlert` is missing from `REDIS_CHANNELS`, add it to `packages/shared/src/constants.ts`.

Also verify `fr:heartbeat:pool-indexer` and `fr:heartbeat:analytics-engine` key format — confirmed in `apps/api/src/modules/admin/admin.service.ts:560`.

---

## Task 1: Add systemAlert to REDIS_CHANNELS (if missing)

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Step 1: Check if systemAlert exists**

```bash
grep -n "systemAlert" packages/shared/src/constants.ts
```

If not found, add it:

```typescript
export const REDIS_CHANNELS = {
  // ... existing channels ...
  systemAlert: 'fr:system:alert',
} as const;
```

**Step 2: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat(shared): add systemAlert channel to REDIS_CHANNELS"
```

---

## Task 2: FailureTracker Module

**Files:**
- Create: `apps/executor/src/modules/safety/failure-tracker.ts`
- Test: `apps/executor/src/modules/safety/failure-tracker.test.ts`

**Step 1: Write failing test**

```typescript
// apps/executor/src/modules/safety/failure-tracker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailureTracker } from './failure-tracker';

describe('FailureTracker', () => {
  let mockRedis: any;
  let tracker: FailureTracker;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };
    tracker = new FailureTracker(mockRedis);
  });

  it('starts with zero consecutive failures', () => {
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('increments failure counter on reverted result', async () => {
    await tracker.record(1, 'reverted');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(1);
  });

  it('increments failure counter on failed result', async () => {
    await tracker.record(1, 'failed');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(1);
  });

  it('increments drift counter on absolute loss', async () => {
    await tracker.recordDrift(1, -15_000_000n); // -$15 in USD terms
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(1);
  });

  it('does not increment drift counter on small loss below threshold', async () => {
    await tracker.recordDrift(1, -5_000_000n); // -$5, below $10 threshold
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('resets counters to zero on included result', async () => {
    await tracker.record(1, 'reverted');
    await tracker.record(1, 'reverted');
    await tracker.record(1, 'included');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('resets drift counter on non-negative profit', async () => {
    await tracker.recordDrift(1, -15_000_000n);
    await tracker.recordNonNegativeProfit(1);
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('persists state to Redis', async () => {
    await tracker.record(1, 'reverted');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'fr:pause:1',
      expect.any(String),
      'EX',
      86400
    );
  });

  it('returns isPaused=true when MAX_CONSECUTIVE_FAILURES exceeded', async () => {
    for (let i = 0; i < 5; i++) await tracker.record(1, 'reverted');
    const state = tracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(state.consecutiveFailures).toBe(5);
  });

  it('returns isPaused=true when MAX_CONSECUTIVE_DRIFT exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await tracker.recordDrift(1, -15_000_000n);
    }
    const state = tracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(state.consecutiveDrift).toBe(3);
  });

  it('resumes chain and clears counters', async () => {
    for (let i = 0; i < 5; i++) await tracker.record(1, 'reverted');
    await tracker.resume(1);
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
    expect(mockRedis.del).toHaveBeenCalledWith('fr:pause:1');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/safety/failure-tracker.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/safety/failure-tracker.ts

import type { Redis } from 'ioredis';

const PAUSE_KEY_PREFIX = 'fr:pause:';
const PAUSE_TTL_SECONDS = 86400; // 24h

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
  constructor(private readonly redis: Redis) {}

  async record(chainId: number, result: 'included' | 'reverted' | 'failed'): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    const state: ChainFailureState = existing ? JSON.parse(existing) : this.emptyState();

    if (result === 'included') {
      state.consecutiveFailures = 0;
      state.consecutiveDrift = 0;
      state.isPaused = false;
      state.pausedAt = undefined;
      state.reason = undefined;
    } else {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        state.isPaused = true;
        state.pausedAt = new Date().toISOString();
        state.reason = 'consecutive_failures';
      }
    }

    await this.persist(key, state);
  }

  async recordDrift(chainId: number, actualProfit: bigint): Promise<void> {
    const lossThreshold = BigInt(DRIFT_LOSS_THRESHOLD_USD * 1_000_000); // Convert USD to microUSD or use appropriate unit
    if (actualProfit >= 0n || actualProfit > -lossThreshold) {
      return; // Not a qualifying loss
    }

    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    const state: ChainFailureState = existing ? JSON.parse(existing) : this.emptyState();

    state.consecutiveDrift += 1;
    if (state.consecutiveDrift >= MAX_CONSECUTIVE_DRIFT) {
      state.isPaused = true;
      state.pausedAt = new Date().toISOString();
      state.reason = 'consecutive_drift';
    }

    await this.persist(key, state);
  }

  async recordNonNegativeProfit(chainId: number): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    if (!existing) return;
    const state: ChainFailureState = JSON.parse(existing);
    state.consecutiveDrift = 0;
    await this.persist(key, state);
  }

  async resume(chainId: number): Promise<void> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    await this.redis.del(key);
  }

  async getState(chainId: number): Promise<ChainFailureState> {
    const key = `${PAUSE_KEY_PREFIX}${chainId}`;
    const existing = await this.redis.get(key);
    if (!existing) return this.emptyState();
    return JSON.parse(existing);
  }

  async recoverFromRedis(): Promise<Map<number, ChainFailureState>> {
    const pausedChains = new Map<number, ChainFailureState>();
    const keys = await this.redis.keys(`${PAUSE_KEY_PREFIX}*`);
    for (const key of keys) {
      const chainId = parseInt(key.replace(PAUSE_KEY_PREFIX, ''), 10);
      const state = await this.getState(chainId);
      if (state.isPaused) {
        pausedChains.set(chainId, state);
      }
    }
    return pausedChains;
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
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/safety/failure-tracker.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/safety/failure-tracker.ts apps/executor/src/modules/safety/failure-tracker.test.ts
git commit -m "feat(executor): add FailureTracker with per-chain counters and Redis persistence"
```

---

## Task 3: AlertPublisher Module

**Files:**
- Create: `apps/executor/src/modules/safety/alert-publisher.ts`
- Test: `apps/executor/src/modules/safety/alert-publisher.test.ts`

**Step 1: Write failing test**

```typescript
// apps/executor/src/modules/safety/alert-publisher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertPublisher } from './alert-publisher';

describe('AlertPublisher', () => {
  let mockRedis: any;
  let publisher: AlertPublisher;

  beforeEach(() => {
    mockRedis = {
      publish: vi.fn().mockResolvedValue(1),
    };
    publisher = new AlertPublisher(mockRedis);
  });

  it('publishes auto_pause alert on consecutive failures', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_failures',
      consecutiveCount: 5,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"type":"auto_pause"')
    );
    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"consecutive_failures"')
    );
  });

  it('publishes auto_pause alert on consecutive drift', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_drift',
      consecutiveCount: 3,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"consecutive_drift"')
    );
  });

  it('publishes auto_pause alert on heartbeat stale', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'heartbeat_stale',
      consecutiveCount: 0,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"heartbeat_stale"')
    );
  });

  it('includes timestamp in ISO format', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_failures',
      consecutiveCount: 5,
      pausedChains: [1],
    });

    const call = mockRedis.publish.mock.calls[0];
    const alert = JSON.parse(call[1]);
    expect(new Date(alert.timestamp).toISOString()).toBe(alert.timestamp);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/safety/alert-publisher.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/safety/alert-publisher.ts

import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

export interface AutoPauseAlert {
  chainId: number;
  trigger: 'consecutive_failures' | 'consecutive_drift' | 'heartbeat_stale';
  consecutiveCount: number;
  pausedChains: number[];
}

export class AlertPublisher {
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(private readonly redis: Redis) {
    this.logger = createLogger('alert-publisher');
  }

  async publishAutoPause(alert: AutoPauseAlert): Promise<void> {
    const payload = {
      type: 'auto_pause',
      ...alert,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.publish('fr:system:alert', JSON.stringify(payload));
      this.logger.info({ alert }, 'Published auto-pause alert');
    } catch (err) {
      this.logger.error({ err, alert }, 'Failed to publish auto-pause alert');
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/safety/alert-publisher.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/safety/alert-publisher.ts apps/executor/src/modules/safety/alert-publisher.test.ts
git commit -m "feat(executor): add AlertPublisher for fr:system:alert"
```

---

## Task 4: RuntimeConfigSubscriber

**Files:**
- Create: `apps/executor/src/modules/safety/runtime-config-subscriber.ts`
- Test: `apps/executor/src/modules/safety/runtime-config-subscriber.test.ts`

**Step 1: Write failing test**

```typescript
// apps/executor/src/modules/safety/runtime-config-subscriber.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeConfigSubscriber } from './runtime-config-subscriber';

describe('RuntimeConfigSubscriber', () => {
  let mockSubscriber: any;
  let subscriber: RuntimeConfigSubscriber;
  let onPauseChange: any;

  beforeEach(() => {
    onPauseChange = vi.fn();
    mockSubscriber = {
      subscribe: vi.fn(),
      psubscribe: vi.fn(),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    subscriber = new RuntimeConfigSubscriber(mockSubscriber as any, onPauseChange);
  });

  it('subscribes to fr:config:changed', async () => {
    await subscriber.start();
    expect(mockSubscriber.subscribe).toHaveBeenCalledWith('fr:config:changed');
  });

  it('calls onPauseChange(true when execution_paused=true', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'execution_paused', value: true }));
    expect(onPauseChange).toHaveBeenCalledWith(true);
  });

  it('calls onPauseChange(true when maintenance_mode=true', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'maintenance_mode', value: true }));
    expect(onPauseChange).toHaveBeenCalledWith(true);
  });

  it('calls onPauseChange(false when execution_paused=false', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'execution_paused', value: false }));
    expect(onPauseChange).toHaveBeenCalledWith(false);
  });

  it('calls onPauseChange(false when maintenance_mode=false', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'maintenance_mode', value: false }));
    expect(onPauseChange).toHaveBeenCalledWith(false);
  });

  it('ignores other config keys', async () => {
    await subscriber.start();
    const handler = mockSubscriber.on.mock.calls.find(([event]) => event === 'message')[1];
    await handler('fr:config:changed', JSON.stringify({ key: 'some_other_key', value: true }));
    expect(onPauseChange).not.toHaveBeenCalled();
  });

  it('closes cleanly', async () => {
    await subscriber.close();
    expect(mockSubscriber.quit).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/safety/runtime-config-subscriber.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/safety/runtime-config-subscriber.ts

import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

const CONFIG_CHANNEL = 'fr:config:changed';
const PAUSE_KEYS = new Set(['execution_paused', 'maintenance_mode']);

export class RuntimeConfigSubscriber {
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(
    private readonly subscriber: Redis,
    private readonly onPauseChange: (paused: boolean) => void
  ) {
    this.logger = createLogger('runtime-config-subscriber');
  }

  async start(): Promise<void> {
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== CONFIG_CHANNEL) return;

      try {
        const { key, value } = JSON.parse(message);

        if (!PAUSE_KEYS.has(key)) return;

        const shouldPause = value === true;
        this.onPauseChange(shouldPause);
        this.logger.info({ key, value, paused: shouldPause }, 'Runtime config pause update');
      } catch (err) {
        this.logger.warn({ err, message }, 'Failed to parse config change message');
      }
    });

    await this.subscriber.subscribe(CONFIG_CHANNEL);
    this.logger.info({}, 'Subscribed to runtime config changes');
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    this.logger.info({}, 'RuntimeConfigSubscriber closed');
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/safety/runtime-config-subscriber.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/safety/runtime-config-subscriber.ts apps/executor/src/modules/safety/runtime-config-subscriber.test.ts
git commit -m "feat(executor): add RuntimeConfigSubscriber for execution_paused and maintenance_mode"
```

---

## Task 5: HealthMonitor

**Files:**
- Create: `apps/executor/src/modules/safety/health-monitor.ts`
- Test: `apps/executor/src/modules/safety/health-monitor.test.ts`

**Step 1: Write failing test**

```typescript
// apps/executor/src/modules/safety/health-monitor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from './health-monitor';

describe('HealthMonitor', () => {
  let mockRedis: any;
  let onUnhealthy: any;
  let clock: any;
  let healthMonitor: HealthMonitor;

  const STALE_THRESHOLD_MS = 120_000;

  beforeEach(() => {
    vi.useFakeTimers();

    mockRedis = {
      get: vi.fn(),
    };
    onUnhealthy = vi.fn();

    healthMonitor = new HealthMonitor(mockRedis, onUnhealthy, {
      checkIntervalMs: 10_000,
      staleThresholdMs: STALE_THRESHOLD_MS,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    healthMonitor.stop();
  });

  it('marks chain healthy when heartbeats are fresh', async () => {
    mockRedis.get.mockResolvedValue(new Date().toISOString());
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it('calls onUnhealthy when pool-indexer heartbeat is stale', async () => {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    mockRedis.get.mockResolvedValue(staleTime);
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('calls onUnhealthy when analytics-engine heartbeat is stale', async () => {
    mockRedis.get
      .mockResolvedValueOnce(new Date().toISOString()) // pool-indexer fresh
      .mockResolvedValueOnce(new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString()); // analytics-engine stale

    healthMonitor.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('fail-closes: marks unhealthy when Redis errors', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis error'));
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('marks chain healthy again when heartbeats recover', async () => {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    mockRedis.get.mockResolvedValueOnce(staleTime);
    healthMonitor.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onUnhealthy).toHaveBeenCalledWith(1, true);

    onUnhealthy.mockClear();
    mockRedis.get.mockResolvedValueOnce(new Date().toISOString());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, false);
  });

  it('stops the background loop', async () => {
    healthMonitor.start();
    healthMonitor.stop();
    mockRedis.get.mockRejectedValue(new Error('Redis error'));

    await vi.advanceTimersByTimeAsync(20_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/safety/health-monitor.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/safety/health-monitor.ts

import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

const HEARTBEAT_KEYS = ['fr:heartbeat:pool-indexer', 'fr:heartbeat:analytics-engine'] as const;

export interface HealthMonitorOptions {
  checkIntervalMs?: number;
  staleThresholdMs?: number;
}

export class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private readonly logger: ReturnType<typeof createLogger>;
  private chainHealthy = new Map<number, boolean>();

  constructor(
    private readonly redis: Redis,
    private readonly onHealthChange: (chainId: number, unhealthy: boolean) => void,
    private readonly options: HealthMonitorOptions = {}
  ) {
    this.logger = createLogger('health-monitor');
  }

  start(): void {
    this.logger.info({}, 'HealthMonitor starting');

    this.intervalId = setInterval(() => {
      void this.check();
    }, this.options.checkIntervalMs ?? 10_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.logger.info({}, 'HealthMonitor stopped');
  }

  isChainHealthy(chainId: number): boolean {
    return this.chainHealthy.get(chainId) ?? false;
  }

  private async check(): Promise<void> {
    const staleThresholdMs = this.options.staleThresholdMs ?? 120_000;
    const cutoff = Date.now() - staleThresholdMs;

    try {
      for (const key of HEARTBEAT_KEYS) {
        const value = await this.redis.get(key);

        if (value === null) {
          this.handleUnhealthy(1, 'heartbeat_missing');
          continue;
        }

        const heartbeatTime = new Date(value).getTime();

        if (heartbeatTime < cutoff) {
          this.handleUnhealthy(1, 'heartbeat_stale');
          break;
        }
      }

      const allKeysFresh = await Promise.all(
        HEARTBEAT_KEYS.map(async (key) => {
          const value = await this.redis.get(key);
          if (value === null) return false;
          return new Date(value).getTime() >= cutoff;
        })
      );

      if (allKeysFresh.every(Boolean)) {
        this.handleHealthy(1);
      }
    } catch (err) {
      this.logger.error({ err }, 'Health check failed — fail-closing');
      this.handleUnhealthy(1, 'health_check_error');
    }
  }

  private handleUnhealthy(chainId: number, reason: string): void {
    if (this.chainHealthy.get(chainId) !== false) {
      this.chainHealthy.set(chainId, false);
      this.onHealthChange(chainId, true);
      this.logger.warn({ chainId, reason }, 'Chain marked unhealthy');
    }
  }

  private handleHealthy(chainId: number): void {
    if (this.chainHealthy.get(chainId) !== true) {
      this.chainHealthy.set(chainId, true);
      this.onHealthChange(chainId, false);
      this.logger.debug({ chainId }, 'Chain health restored');
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/safety/health-monitor.test.ts
# Fix any issues until PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/safety/health-monitor.ts apps/executor/src/modules/safety/health-monitor.test.ts
git commit -m "feat(executor): add HealthMonitor with 10s heartbeat freshness check"
```

---

## Task 6: SafetyService

**Files:**
- Create: `apps/executor/src/modules/safety/safety-service.ts`
- Test: `apps/executor/src/modules/safety/safety-service.test.ts`

**Step 1: Write failing test**

```typescript
// apps/executor/src/modules/safety/safety-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyService } from './safety-service';

describe('SafetyService', () => {
  let mockFailureTracker: any;
  let mockHealthMonitor: any;
  let safetyService: SafetyService;

  beforeEach(() => {
    mockFailureTracker = {
      getState: vi.fn().mockReturnValue({ consecutiveFailures: 0, consecutiveDrift: 0, isPaused: false }),
      record: vi.fn(),
      recordDrift: vi.fn(),
      recordNonNegativeProfit: vi.fn(),
      resume: vi.fn(),
      recoverFromRedis: vi.fn().mockResolvedValue(new Map()),
    };
    mockHealthMonitor = {
      isChainHealthy: vi.fn().mockReturnValue(true),
    };

    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1, 42161], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      false // globalPaused
    );
  });

  it('allows execution when all gates pass', async () => {
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(true);
  });

  it('blocks when EXECUTION_ENABLED=false', async () => {
    safetyService = new SafetyService(
      { enabled: false, privateKey: '', chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      false
    );
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('execution_disabled');
  });

  it('blocks when global paused via runtime config', async () => {
    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      true // globalPaused
    );
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('maintenance_mode');
  });

  it('blocks when chain is unhealthy', async () => {
    mockHealthMonitor.isChainHealthy.mockReturnValue(false);
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('unhealthy');
  });

  it('blocks when chain is auto-paused due to failures', async () => {
    mockFailureTracker.getState.mockReturnValue({ consecutiveFailures: 5, consecutiveDrift: 0, isPaused: true, reason: 'consecutive_failures' });
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('consecutive_failures');
  });

  it('records included result and resets counters', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'included');
  });

  it('records reverted result and increments failure counter', async () => {
    await safetyService.recordResult(1, { status: 'reverted' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'reverted');
  });

  it('records failed result and increments failure counter', async () => {
    await safetyService.recordResult(1, { status: 'failed' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'failed');
  });

  it('records drift on negative actual profit', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' }, -15_000_000n);
    expect(mockFailureTracker.recordDrift).toHaveBeenCalledWith(1, -15_000_000n);
  });

  it('records non-negative profit and resets drift counter', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' }, 10_000_000n);
    expect(mockFailureTracker.recordNonNegativeProfit).toHaveBeenCalledWith(1);
  });

  it('resumes chain and resets all counters', async () => {
    await safetyService.resumeChain(1);
    expect(mockFailureTracker.resume).toHaveBeenCalledWith(1);
  });

  it('recovers paused chains from Redis on startup', async () => {
    const recovered = new Map([[1, { consecutiveFailures: 5, consecutiveDrift: 0, isPaused: true }]]);
    mockFailureTracker.recoverFromRedis.mockResolvedValue(recovered);
    await safetyService.recoverFromRedis();
    const paused = safetyService.getPausedChains();
    expect(paused.has(1)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/safety/safety-service.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/safety/safety-service.ts

import type { ExecutionConfig } from '../../config/execution.config';
import type { FailureTracker } from './failure-tracker';
import type { HealthMonitor } from './health-monitor';
import type { AlertPublisher } from './alert-publisher';
import type { ExecutionResult } from '../../services/execution-engine';
import { createLogger } from '@flashroute/shared';

export interface SafetyDecision {
  allowed: boolean;
  reason?: string;
  chainId: number;
}

export class SafetyService {
  private readonly logger: ReturnType<typeof createLogger>;
  private globalPaused: boolean;
  private autoPausedChains = new Set<number>();

  constructor(
    private readonly config: ExecutionConfig,
    private readonly failureTracker: FailureTracker,
    private readonly healthMonitor: HealthMonitor,
    private readonly alertPublisher: AlertPublisher,
    globalPaused = false
  ) {
    this.logger = createLogger('safety-service');
    this.globalPaused = globalPaused;
  }

  setGlobalPaused(paused: boolean): void {
    this.globalPaused = paused;
    this.logger.info({ paused }, 'Global pause state updated');
  }

  async shouldExecute(route: { id: string; chainId: number; simulatedAt: number }): Promise<SafetyDecision> {
    const chainId = route.chainId;

    // Gate 1: Global admin pause
    if (!this.config.enabled) {
      return { allowed: false, reason: 'execution_disabled', chainId };
    }
    if (this.globalPaused) {
      return { allowed: false, reason: 'maintenance_mode', chainId };
    }

    // Gate 2: Per-chain health
    if (!this.healthMonitor.isChainHealthy(chainId)) {
      return { allowed: false, reason: 'chain_unhealthy', chainId };
    }

    // Gate 3: Per-chain auto-pause
    if (this.autoPausedChains.has(chainId)) {
      const state = await this.failureTracker.getState(chainId);
      return { allowed: false, reason: `chain_paused:${state.reason ?? 'unknown'}`, chainId };
    }

    return { allowed: true, chainId };
  }

  async recordResult(chainId: number, result: ExecutionResult, actualProfit?: bigint): Promise<void> {
    if (result.status === 'included') {
      await this.failureTracker.record(chainId, 'included');
      if (actualProfit !== undefined) {
        if (actualProfit < 0n) {
          await this.failureTracker.recordDrift(chainId, actualProfit);
        } else {
          await this.failureTracker.recordNonNegativeProfit(chainId);
        }
      }
    } else if (result.status === 'reverted' || result.status === 'failed') {
      await this.failureTracker.record(chainId, result.status);
    }

    await this.checkAutoPause(chainId);
  }

  private async checkAutoPause(chainId: number): Promise<void> {
    const state = await this.failureTracker.getState(chainId);
    if (state.isPaused && !this.autoPausedChains.has(chainId)) {
      this.autoPausedChains.add(chainId);
      await this.alertPublisher.publishAutoPause({
        chainId,
        trigger: state.reason as any,
        consecutiveCount: state.consecutiveFailures || state.consecutiveDrift,
        pausedChains: Array.from(this.autoPausedChains),
      });
      this.logger.warn({ chainId, state }, 'Chain auto-paused due to safety threshold');
    }
  }

  getPausedChains(): Set<number> {
    return new Set(this.autoPausedChains);
  }

  async resumeChain(chainId: number): Promise<void> {
    this.autoPausedChains.delete(chainId);
    await this.failureTracker.resume(chainId);
    this.logger.info({ chainId }, 'Chain resumed');
  }

  async recoverFromRedis(): Promise<void> {
    const recovered = await this.failureTracker.recoverFromRedis();
    for (const [chainId, state] of recovered.entries()) {
      if (state.isPaused) {
        this.autoPausedChains.add(chainId);
        this.logger.info({ chainId, state }, 'Recovered paused chain from Redis');
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/safety/safety-service.test.ts
# Fix any issues until PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/safety/safety-service.ts apps/executor/src/modules/safety/safety-service.test.ts
git commit -m "feat(executor): add SafetyService with layered safety gates"
```

---

## Task 7: Wire SafetyService into ExecutorWorker

**Files:**
- Modify: `apps/executor/src/workers/executor.ts`

**Step 1: Read current file**

Review the current `apps/executor/src/workers/executor.ts` to understand how it constructs `ExecutionEngine` and calls it from `handleRouteDiscovered`.

**Step 2: Add SafetyService integration**

The `ExecutorWorker` needs to:
1. Construct `FailureTracker`, `AlertPublisher`, `RuntimeConfigSubscriber`, `HealthMonitor`, `SafetyService`
2. Wire `SafetyService.shouldExecute()` into `handleRouteDiscovered` BEFORE calling `executionEngine.execute()`
3. Call `SafetyService.recordResult()` AFTER `executionEngine.execute()` completes
4. Wire `RuntimeConfigSubscriber` to call `SafetyService.setGlobalPaused()`
5. Wire `HealthMonitor` to call `SafetyService` when chain health changes
6. Call `SafetyService.recoverFromRedis()` on startup
7. Start `HealthMonitor` background loop
8. Stop `HealthMonitor` and `RuntimeConfigSubscriber` on shutdown

```typescript
// In executor.ts constructor or start():
// Wire up:
const failureTracker = new FailureTracker(redisClients.cache);
const alertPublisher = new AlertPublisher(redisClients.publisher);
const safetyService = new SafetyService(
  config,
  failureTracker,
  healthMonitor,
  alertPublisher,
  false
);

// RuntimeConfigSubscriber
const configSubscriber = new RuntimeConfigSubscriber(
  redisClients.subscriber,
  (paused) => safetyService.setGlobalPaused(paused)
);

// HealthMonitor
const healthMonitor = new HealthMonitor(
  redisClients.cache,
  (chainId, unhealthy) => {
    if (unhealthy) {
      safetyService.setChainUnhealthy(chainId);
    } else {
      safetyService.setChainHealthy(chainId);
    }
  }
);

// In handleRouteDiscovered, BEFORE executionEngine.execute():
const decision = await safetyService.shouldExecute(route);
if (!decision.allowed) {
  this.logger.info({ routeId: route.id, reason: decision.reason }, 'Execution blocked by safety gate');
  return;
}

// AFTER executionEngine.execute(), for result:
if (result.status === 'included' || result.status === 'reverted' || result.status === 'failed') {
  await safetyService.recordResult(route.chainId, result, actualProfit);
}
```

Also add `setChainUnhealthy` and `setChainHealthy` methods to `SafetyService`:

```typescript
setChainUnhealthy(chainId: number): void {
  if (!this.autoPausedChains.has(chainId)) {
    this.autoPausedChains.add(chainId);
    this.alertPublisher.publishAutoPause({
      chainId,
      trigger: 'heartbeat_stale',
      consecutiveCount: 0,
      pausedChains: Array.from(this.autoPausedChains),
    });
  }
}

setChainHealthy(chainId: number): void {
  this.autoPausedChains.delete(chainId);
}
```

**Step 3: Verify typecheck**

```bash
cd apps/executor && pnpm typecheck
# Fix any errors
```

**Step 4: Commit**

```bash
git add apps/executor/src/workers/executor.ts apps/executor/src/modules/safety/safety-service.ts
git commit -m "feat(executor): wire SafetyService into ExecutorWorker"
```

---

## Task 8: Integration Tests

**Files:**
- Create: `apps/executor/src/modules/safety/safety.integration.test.ts`

**Step 1: Write integration test**

```typescript
// apps/executor/src/modules/safety/safety.integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyService } from './safety-service';
import { FailureTracker } from './failure-tracker';
import { HealthMonitor } from './health-monitor';
import { AlertPublisher } from './alert-publisher';

describe('Safety Integration', () => {
  let mockRedis: any;
  let failureTracker: FailureTracker;
  let alertPublisher: AlertPublisher;
  let healthMonitor: HealthMonitor;
  let safetyService: SafetyService;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(new Date().toISOString()),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    };

    failureTracker = new FailureTracker(mockRedis as any);
    alertPublisher = new AlertPublisher(mockRedis as any);
  });

  it('full flow: 5 consecutive failures triggers auto-pause', async () => {
    healthMonitor = new HealthMonitor(mockRedis as any, vi.fn(), { checkIntervalMs: 999999 });

    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      failureTracker,
      healthMonitor,
      alertPublisher,
      false
    );

    // Simulate 5 consecutive reverts
    for (let i = 0; i < 5; i++) {
      await safetyService.recordResult(1, { status: 'reverted' });
    }

    // Now should be blocked
    const decision = await safetyService.shouldExecute({ id: 'route-1', chainId: 1, simulatedAt: Date.now() } as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('consecutive_failures');
    expect(safetyService.getPausedChains().has(1)).toBe(true);
  });

  it('recovery: paused chains recovered from Redis on startup', async () => {
    // Simulate Redis already has a paused chain
    mockRedis.keys.mockResolvedValue(['fr:pause:1']);
    mockRedis.get.mockResolvedValue(JSON.stringify({
      consecutiveFailures: 5,
      consecutiveDrift: 0,
      isPaused: true,
      reason: 'consecutive_failures',
    }));

    const tracker = new FailureTracker(mockRedis as any);
    await tracker.recoverFromRedis();

    healthMonitor = new HealthMonitor(mockRedis as any, vi.fn(), { checkIntervalMs: 999999 });
    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      tracker,
      healthMonitor,
      alertPublisher,
      false
    );

    await safetyService.recoverFromRedis();

    expect(safetyService.getPausedChains().has(1)).toBe(true);
  });

  it('manual resume clears pause state and allows execution', async () => {
    // Pre-pause the chain
    mockRedis.keys.mockResolvedValue(['fr:pause:1']);
    mockRedis.get.mockResolvedValue(JSON.stringify({
      consecutiveFailures: 5,
      consecutiveDrift: 0,
      isPaused: true,
      reason: 'consecutive_failures',
    }));

    const tracker = new FailureTracker(mockRedis as any);
    healthMonitor = new HealthMonitor(mockRedis as any, vi.fn(), { checkIntervalMs: 999999 });
    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      tracker,
      healthMonitor,
      alertPublisher,
      false
    );
    await safetyService.recoverFromRedis();

    // Resume
    await safetyService.resumeChain(1);

    // Now should be allowed
    const decision = await safetyService.shouldExecute({ id: 'route-1', chainId: 1, simulatedAt: Date.now() } as any);
    expect(decision.allowed).toBe(true);
    expect(safetyService.getPausedChains().has(1)).toBe(false);
  });
});
```

**Step 2: Run tests and fix**

```bash
cd apps/executor && pnpm test src/modules/safety/safety.integration.test.ts
# Fix any failures
```

**Step 3: Commit**

```bash
git add apps/executor/src/modules/safety/safety.integration.test.ts
git commit -m "test(executor): add safety controls integration tests"
```

---

## Task 9: Update package.json scripts

**Files:**
- Modify: `apps/executor/package.json`

Add any new scripts if needed. The existing `dev` and `build` scripts should already be sufficient from Task 12 (F2).

---

## Reference Files

- Design: `docs/plans/2026-03-28-F3-safety-controls-design.md`
- Spec: `09-BACKEND-CORE-3.md` (safety controls section)
- Spec: `12-BACKEND-ADMIN.md` (runtime config, maintenance_mode)
- Execution Engine: `apps/executor/src/services/execution-engine.ts`
- Worker: `apps/executor/src/workers/executor.ts`
- Admin Service: `apps/api/src/modules/admin/admin.service.ts` (fr:config:changed publishing)
- Shared constants: `packages/shared/src/constants.ts`
