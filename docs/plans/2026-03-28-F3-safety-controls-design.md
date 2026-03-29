# F3 Execution Safety Controls — Design

**Phase:** F3 of FlashRoute Build
**Date:** 2026-03-28
**Status:** Approved for implementation

## Overview

The executor's safety control layer that makes live execution safe enough to enable. Every safety mechanism fail-closes: if something goes wrong, execution stops rather than continues.

## Safety Gates

All gates are evaluated in `SafetyService.shouldExecute()` before any execution proceeds. Each returns `{ allowed: boolean; reason?: string }`.

### Gate 1: Admin Global Pause

Checks two sources:
- `EXECUTION_ENABLED` env var (`false` by default)
- `execution_paused` runtime config (admin API, published to `fr:config:changed`)
- `maintenance_mode` runtime config (admin API, published to `fr:config:changed`)

Either `execution_paused=true` OR `maintenance_mode=true` blocks all execution globally. These are not per-chain.

The executor subscribes to `fr:config:changed` and updates an in-memory flag within one polling cycle.

### Gate 2: Per-Chain Health Check

If any critical worker's heartbeat is stale (>120s), that chain is marked unhealthy and execution stops for that chain only (other chains continue).

Checks:
- `fr:heartbeat:pool-indexer` — stale = stop all chains
- `fr:heartbeat:analytics-engine` — stale = stop all chains

Heartbeat freshness is checked by a background loop every 10s. Results are cached in memory. The fail-closed principle applies: if the health check itself errors (Redis unreachable), treat as unhealthy and block.

### Gate 3: Per-Chain Auto-Pause (Consecutive Failures)

Tracked per-chain, persisted in Redis (`fr:pause:{chainId}`):

- Any `reverted` or `failed` result increments the failure counter for that chain
- Any `included` result resets the failure counter to 0
- Threshold: **5 consecutive failures** → auto-pause that chain

### Gate 4: Per-Chain Auto-Pause (Drift)

Tracked per-chain alongside the failure counter:

- After a trade settles with `included`, the executor reads actual profit from on-chain `ExecutionResult` event
- If `actualProfit < 0` AND `|actualProfit| > $10` (absolute loss threshold), counts as a drift failure
- Any trade with `actualProfit >= 0` resets the drift counter to 0
- Threshold: **3 consecutive drift failures** → auto-pause that chain

The simulated profit comes from the route's `profitUsd` field (set by ProfitSimulator). Actual profit is decoded from the `ExecutionResult(int256)` event emitted by `FlashRouteExecutor`.

## Components

### SafetyService (`apps/executor/src/modules/safety/safety-service.ts`)

Holds all safety state. Wraps `ExecutionEngine.execute()` with safety gate checks.

Interface:
```typescript
interface SafetyDecision {
  allowed: boolean;
  reason?: string;
  chainId: number;
}

interface SafetyService {
  shouldExecute(route: DiscoveredRoute): Promise<SafetyDecision>;
  recordResult(chainId: number, result: ExecutionResult, actualProfit?: bigint): void;
  getPausedChains(): Set<number>;
  resumeChain(chainId: number): void;
  recoverFromRedis(): Promise<void>;
}
```

### HealthMonitor (`apps/executor/src/modules/safety/health-monitor.ts`)

Background ticker (every 10s) that:
1. Reads `fr:heartbeat:pool-indexer` and `fr:heartbeat:analytics-engine` from Redis
2. Parses as ISO timestamp, checks freshness vs 120s threshold
3. Updates `SafetyService.setChainHealthy(chainId, healthy: boolean)`

On any error: treats all chains as unhealthy (fail-closed).

### RuntimeConfigSubscriber (`apps/executor/src/modules/safety/runtime-config-subscriber.ts`)

Subscribes to `fr:config:changed` and handles:
- `execution_paused: true/false` → updates global pause flag
- `maintenance_mode: true/false` → updates global pause flag

Either `true` → block all execution globally.

### AlertPublisher (`apps/executor/src/modules/safety/alert-publisher.ts`)

Publishes structured alerts to `fr:system:alert` Redis channel when:
- Auto-pause triggers (consecutive failures, consecutive drift, heartbeat stale)
- Auto-resume occurs (operator manual action)

Alert format:
```json
{
  "type": "auto_pause",
  "trigger": "consecutive_failures | consecutive_drift | heartbeat_stale",
  "chainId": 1,
  "consecutiveCount": 5,
  "pausedChains": [1],
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

### FailureTracker (`apps/executor/src/modules/safety/failure-tracker.ts`)

Per-chain counters (in-memory + Redis-persisted):

```typescript
interface ChainFailureState {
  consecutiveFailures: number;
  consecutiveDrift: number;
  lastResult: 'included' | 'reverted' | 'failed' | null;
  actualProfitLast: number | null;
}
```

- Counters persisted to Redis at `fr:pause:{chainId}` with 24h TTL
- On `included`: reset both counters
- On `reverted`/`failed`: increment failure counter
- On drift (actual loss > $10): increment drift counter
- On non-negative actual profit: reset drift counter

## Pause State

- Key: `fr:pause:{chainId}` (value: JSON `{ pausedAt, reason, consecutiveFailures, consecutiveDrift }`)
- TTL: 24h, refreshed on each update
- On startup: `SafetyService.recoverFromRedis()` reads all `fr:pause:*` keys and restores in-memory state
- Manual resume: operator calls admin API → `execution_paused=false` OR explicit `resumeChain` → clears Redis key, resets counters

## Constants

| Constant | Default | Env var |
|---|---|---|
| `MAX_CONSECUTIVE_FAILURES` | 5 | `EXECUTOR_MAX_CONSECUTIVE_FAILURES` |
| `MAX_CONSECUTIVE_DRIFT` | 3 | `EXECUTOR_MAX_CONSECUTIVE_DRIFT` |
| `DRIFT_LOSS_THRESHOLD_USD` | $10 | `EXECUTOR_DRIFT_LOSS_THRESHOLD_USD` |
| `HEARTBEAT_STALE_THRESHOLD_MS` | 120,000 (2 min) | `EXECUTOR_HEARTBEAT_STALE_THRESHOLD_MS` |
| `HEALTH_CHECK_INTERVAL_MS` | 10,000 (10s) | — |

## Execution Flow

```
ExecutorWorker.handleRouteDiscovered(message)
  → SafetyService.shouldExecute(route)
      → Gate 1: Global pause? (EXECUTION_ENABLED + execution_paused + maintenance_mode)
      → Gate 2: Chain healthy? (heartbeat freshness)
      → Gate 3: Chain auto-paused? (consecutive failures)
      → Gate 4: Drift threshold? (consecutive drift losses)
  → ExecutionEngine.execute(route, strategy) [if all gates pass]
  → SafetyService.recordResult(chainId, result, actualProfit)
      → update counters, check thresholds, trigger auto-pause if needed
      → if auto-pause triggered: publish alert to fr:system:alert
```

## Fail-Closed Principle

Every safety mechanism errs on the side of stopping execution:
- Unknown health state → block
- Redis error during health check → block
- `maintenance_mode` or `execution_paused` unknown → block
- Counters at threshold → block

## Files

| File | Purpose |
|---|---|
| `apps/executor/src/modules/safety/safety-service.ts` | Core safety decision logic |
| `apps/executor/src/modules/safety/health-monitor.ts` | Background heartbeat checker |
| `apps/executor/src/modules/safety/runtime-config-subscriber.ts` | `fr:config:changed` subscription |
| `apps/executor/src/modules/safety/alert-publisher.ts` | `fr:system:alert` publisher |
| `apps/executor/src/modules/safety/failure-tracker.ts` | Per-chain failure/drift counters |
| `apps/executor/src/modules/safety/safety-service.test.ts` | Unit tests |
| `apps/executor/src/modules/safety/health-monitor.test.ts` | Unit tests |
| `apps/executor/src/modules/safety/failure-tracker.test.ts` | Unit tests |
| `apps/executor/src/modules/safety/runtime-config-subscriber.test.ts` | Unit tests |
| `apps/executor/src/workers/executor.ts` | Wire SafetyService into ExecutorWorker |
