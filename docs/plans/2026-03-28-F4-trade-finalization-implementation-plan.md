# F4 — Trade Finalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire execution results from the executor through `fr:trades:queue` into Postgres (via API), and publish trade updates to `fr:trades:live` for WebSocket dashboard updates.

**Architecture:** Executor publishes create/update messages to `fr:trades:queue` (Redis list). A standalone BRPOP consumer loop in jobs-worker reads from the queue, calls the API to persist trades, and publishes updates to `fr:trades:live` pub/sub. Analytics aggregation remains on the existing daily cron.

**Tech Stack:** `ioredis` (raw Redis, not BullMQ over it), `axios` for internal API calls, vitest for testing.

---

## Pre-Check: Explore Existing Code

Before starting, read these files to understand the existing code:
- `apps/executor/src/services/execution-engine.ts` — find the mock `tradeService` and `createTrade`/`updateTrade` calls
- `apps/executor/src/channels/trade-queue-publisher.ts` — understand `publishCreateTrade`/`publishUpdateTrade`
- `apps/executor/src/workers/executor.ts` — find where `ExecutionEngine` is instantiated with mock tradeService
- `apps/jobs-worker/src/index.ts` — understand how the worker starts and registers processors
- `apps/jobs-worker/src/queues/connection.ts` — understand how Redis connection is created in jobs-worker
- `apps/api/src/modules/trades/trades.service.ts` — understand `create()` and `updateStatus()` signatures
- `packages/shared/src/constants.ts` — confirm `REDIS_CHANNELS.tradesQueue` and `REDIS_CHANNELS.tradesLive` values

---

## Task 1: Wire TradeQueuePublisher into ExecutionEngine

**Files:**
- Modify: `apps/executor/src/services/execution-engine.ts` — replace mock `tradeService` with real `TradeQueuePublisher`
- Modify: `apps/executor/src/workers/executor.ts` — pass `TradeQueuePublisher` to `ExecutionEngine`

### Step 1: Add TradeQueuePublisher import to execution-engine.ts

Read `apps/executor/src/services/execution-engine.ts` first ~30 lines. Add `TradeQueuePublisher` and `REDIS_CHANNELS` to imports.

### Step 2: Add tradeQueuePublisher field to ExecutionEngine class

Read the class fields section. Add:
```typescript
private readonly tradeQueuePublisher: TradeQueuePublisher;
```

### Step 3: Update ExecutionEngine constructor

Read the constructor. Add `TradeQueuePublisher` as a constructor parameter and assign it.

### Step 4: Replace mock createTrade call

Find the mock `createTrade` call (around line 178). Replace with:
```typescript
const tradeId = await this.tradeQueuePublisher.publishCreateTrade({
  strategyId: strategy.id,
  chainId,
  routePath: route.hops.map((h) => h.router).join('→'),
  flashLoanProvider: route.provider,
  flashLoanToken: route.token,
  flashLoanAmount: route.amount.toString(),
  status: relay instanceof FlashbotsRelay ? 'submitted_private' : 'submitted_public',
});
```

### Step 5: Replace mock updateTrade calls

Find the `updateTrade` calls (around lines 193 and 201). Replace with:
```typescript
await this.tradeQueuePublisher.publishUpdateTrade(tradeId, {
  status: 'included',
  txHash: relayResult.txHash,
  blockNumber: relayResult.blockNumber,
});
```
and
```typescript
await this.tradeQueuePublisher.publishUpdateTrade(tradeId, {
  status: isOnChainRevert ? 'reverted' : 'failed',
  errorMessage: relayResult.error ?? relayResult.reason,
});
```

### Step 6: Update executor.ts to pass TradeQueuePublisher

Read `apps/executor/src/workers/executor.ts`. Find where `ExecutionEngine` is constructed. Add a `TradeQueuePublisher` field and pass it to `ExecutionEngine`.

### Step 7: Add import and create TradeQueuePublisher

In `executor.ts`, add import for `TradeQueuePublisher` from `../channels/trade-queue-publisher`. Create it using `cacheClient` (or the appropriate Redis client).

### Step 8: Run typecheck

```bash
cd apps/executor && pnpm typecheck
```
Expected: No errors (or only pre-existing ones).

### Step 9: Run executor tests

```bash
cd apps/executor && pnpm test src/workers/executor.test.ts
```
Expected: All 5 pass.

### Step 10: Commit

```bash
git add apps/executor/src/services/execution-engine.ts apps/executor/src/workers/executor.ts
git commit -m "feat(executor): wire TradeQueuePublisher into ExecutionEngine"
```

---

## Task 2: Create TradeApiClient in jobs-worker

**Files:**
- Create: `apps/jobs-worker/src/modules/trade-api.client.ts`
- Test: `apps/jobs-worker/src/modules/trade-api.client.test.ts`

### Step 1: Create the file with class skeleton

```typescript
import axios, { AxiosInstance } from 'axios';

export class TradeApiClient {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({ baseURL: baseUrl });
  }

  async createTrade(payload: Record<string, unknown>): Promise<{ id: string }> {
    const response = await this.client.post('/internal/trades', payload);
    return response.data;
  }

  async updateTradeStatus(
    tradeId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.client.patch(`/internal/trades/${tradeId}/status`, payload);
  }
}
```

### Step 2: Write failing tests

Create `trade-api.client.test.ts` with:
- `createTrade makes POST request to /internal/trades`
- `createTrade returns trade id from response`
- `updateTradeStatus makes PATCH request to /internal/trades/:id/status`
- `updateTradeStatus throws on API error`

Use `vi.mock('axios')` and mock `axios.post` and `axios.patch`.

### Step 3: Run tests to verify they fail

```bash
cd apps/jobs-worker && pnpm test src/modules/trade-api.client.test.ts
```
Expected: Tests fail (implementation missing or mocks not set up).

### Step 4: Implement the class

Write the implementation matching the skeleton above.

### Step 5: Run tests to verify they pass

Expected: All 4 pass.

### Step 6: Commit

```bash
git add apps/jobs-worker/src/modules/trade-api.client.ts apps/jobs-worker/src/modules/trade-api.client.test.ts
git commit -m "feat(jobs-worker): add TradeApiClient for internal API calls"
```

---

## Task 3: Create TradeQueueProcessor (standalone BRPOP loop)

**Files:**
- Create: `apps/jobs-worker/src/modules/trade-queue.processor.ts`
- Test: `apps/jobs-worker/src/modules/trade-queue.processor.test.ts`

### Step 1: Read the existing connection.ts and constants.ts in jobs-worker

```bash
cat apps/jobs-worker/src/queues/connection.ts
cat apps/jobs-worker/src/queues/constants.ts
```
Understand how Redis is connected and what queue names are used.

### Step 2: Create the TradeQueueProcessor class

```typescript
import Redis from 'ioredis';
import { TradeApiClient } from './trade-api.client';
import { REDIS_CHANNELS } from '@flashroute/shared';

export interface TradeCreateMessage {
  type: 'create';
  payload: Record<string, unknown>;
}

export interface TradeUpdateMessage {
  type: 'update';
  tradeId: string;
  payload: Record<string, unknown>;
}

export type TradeQueueMessage = TradeCreateMessage | TradeUpdateMessage;

export class TradeQueueProcessor {
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly apiClient: TradeApiClient,
    private readonly logger: { info: Function; error: Function; warn: Function }
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.logger.info({}, 'TradeQueueProcessor started');
    while (this.running) {
      try {
        const result = await this.redis.brpop(REDIS_CHANNELS.tradesQueue, 5);
        if (result) {
          const [, message] = result;
          await this.processMessage(message);
        }
      } catch (err) {
        this.logger.error({ err }, 'Error in BRPOP loop');
        await sleep(1000);
      }
    }
    this.logger.info({}, 'TradeQueueProcessor stopped');
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async processMessage(message: string): Promise<void> {
    let parsed: TradeQueueMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.logger.warn({ message }, 'Failed to parse trade queue message');
      return;
    }

    try {
      if (parsed.type === 'create') {
        const trade = await this.apiClient.createTrade(parsed.payload);
        await this.publishTradeUpdate(trade.id, parsed.payload);
        this.logger.info({ tradeId: trade.id }, 'Trade created via queue');
      } else if (parsed.type === 'update') {
        await this.apiClient.updateTradeStatus(parsed.tradeId, parsed.payload);
        await this.publishTradeUpdate(parsed.tradeId, parsed.payload);
        this.logger.info({ tradeId: parsed.tradeId }, 'Trade updated via queue');
      }
    } catch (err) {
      this.logger.error({ err, message: parsed }, 'Failed to process trade message');
      // Don't rethrow — let the message stay in the list for retry
      // (we don't delete it from the list on failure)
    }
  }

  private async publishTradeUpdate(
    tradeId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const message = JSON.stringify({
      event: 'trade_update',
      tradeId,
      status: payload.status,
      chainId: payload.chainId,
      profitUsd: payload.profitUsd,
      updatedAt: new Date().toISOString(),
    });
    await this.redis.publish(REDIS_CHANNELS.tradesLive, message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Step 3: Write failing tests

Create `trade-queue.processor.test.ts`:
- Mock Redis `brpop` and `publish`
- Mock TradeApiClient `createTrade` and `updateTradeStatus`
- Test: `processMessage create` calls apiClient.createTrade and redis.publish
- Test: `processMessage update` calls apiClient.updateTradeStatus and redis.publish
- Test: `processMessage parse error` logs warning and doesn't call API
- Test: `processMessage API error` logs error but doesn't rethrow
- Test: `stop()` sets running to false and loop exits

### Step 4: Run tests to verify they fail

```bash
cd apps/jobs-worker && pnpm test src/modules/trade-queue.processor.test.ts
```
Expected: FAIL (TradeQueueProcessor not defined).

### Step 5: Write minimal implementation

Create the file with the implementation above.

### Step 6: Run tests to verify they pass

Expected: All pass.

### Step 7: Commit

```bash
git add apps/jobs-worker/src/modules/trade-queue.processor.ts apps/jobs-worker/src/modules/trade-queue.processor.test.ts
git commit -m "feat(jobs-worker): add TradeQueueProcessor with standalone BRPOP loop"
```

---

## Task 4: Wire TradeQueueProcessor into jobs-worker main

**Files:**
- Modify: `apps/jobs-worker/src/index.ts` — start TradeQueueProcessor alongside existing schedulers
- Modify: `apps/jobs-worker/src/queues/connection.ts` — export the Redis client for use by the processor

### Step 1: Read index.ts

```bash
cat apps/jobs-worker/src/index.ts
```
Understand the startup sequence.

### Step 2: Read connection.ts

```bash
cat apps/jobs-worker/src/queues/connection.ts
```
Understand how the Redis connection is created and exported.

### Step 3: Export createRedisClient from connection.ts

If the Redis client isn't exported, export it so `TradeQueueProcessor` can use the same connection.

### Step 4: Create TradeQueueProcessor in index.ts

Read `index.ts`. Add:
```typescript
import { TradeQueueProcessor } from './modules/trade-queue.processor';
import { TradeApiClient } from './modules/trade-api.client';
import { createRedisClient } from './queues/connection';

const redis = createRedisClient();
const apiClient = new TradeApiClient(process.env.API_URL ?? 'http://localhost:3000');
const tradeQueueProcessor = new TradeQueueProcessor(
  redis,
  apiClient,
  {
    info: (ctx, msg) => console.log(JSON.stringify({ service: 'trade-queue-processor', ...ctx, msg })),
    error: (ctx, msg) => console.error(JSON.stringify({ service: 'trade-queue-processor', ...ctx, msg })),
    warn: (ctx, msg) => console.warn(JSON.stringify({ service: 'trade-queue-processor', ...ctx, msg })),
  }
);
```

Then in the startup:
```typescript
await tradeQueueProcessor.start();
```

And on shutdown:
```typescript
await tradeQueueProcessor.stop();
```

### Step 5: Add Redis client mock to existing jobs-worker tests

Before modifying index.ts, check if there are existing tests. If so, make sure the mock Redis setup works with the new code. You may need to add `brpop` and `publish` mocks to the existing test setup.

### Step 6: Run jobs-worker tests

```bash
cd apps/jobs-worker && pnpm test
```
Expected: All pass.

### Step 7: Run typecheck

```bash
cd apps/jobs-worker && pnpm typecheck
```
Expected: No errors.

### Step 8: Commit

```bash
git add apps/jobs-worker/src/index.ts apps/jobs-worker/src/queues/connection.ts
git commit -m "feat(jobs-worker): wire TradeQueueProcessor into main startup"
```

---

## Task 5: End-to-End Integration Test

**Files:**
- Create: `apps/jobs-worker/src/modules/trade-queue.integration.test.ts`

### Step 1: Write integration test

This test uses a real Redis instance (ioredis-mock or a test Redis). It:
1. Publishes a create message to `fr:trades:queue` using LPUSH
2. Runs the TradeQueueProcessor for a short time
3. Verifies the API client was called correctly
4. Verifies a message was published to `fr:trades:live`

### Step 2: Run integration tests

```bash
cd apps/jobs-worker && pnpm test src/modules/trade-queue.integration.test.ts
```

### Step 3: Commit

```bash
git add apps/jobs-worker/src/modules/trade-queue.integration.test.ts
git commit -m "test(jobs-worker): add trade queue integration test"
```

---

## Task 6: Run Full Test Suite

Before this step, check what test scripts exist in jobs-worker:

```bash
cat apps/jobs-worker/package.json | grep -A 5 '"scripts"'
```

Run the full test suite:

```bash
cd apps/jobs-worker && pnpm test
```

If there are pre-existing test failures unrelated to F4, document them but don't block on fixing them.

Run typecheck:

```bash
cd apps/jobs-worker && pnpm typecheck
```

---

## Task 7: Final Verification

1. Confirm all 3 apps (api, executor, jobs-worker) typecheck cleanly
2. Run executor tests: `cd apps/executor && pnpm test`
3. Run jobs-worker tests: `cd apps/jobs-worker && pnpm test`
4. Commit everything

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `apps/jobs-worker/src/modules/trade-api.client.ts` | Internal HTTP client for API trade endpoints |
| `apps/jobs-worker/src/modules/trade-api.client.test.ts` | 4 unit tests |
| `apps/jobs-worker/src/modules/trade-queue.processor.ts` | BRPOP consumer loop |
| `apps/jobs-worker/src/modules/trade-queue.processor.test.ts` | 4-5 unit tests |
| `apps/jobs-worker/src/modules/trade-queue.integration.test.ts` | Integration test |
| `docs/plans/2026-03-28-F4-trade-finalization-design.md` | Design doc (already committed) |

## Summary of Modified Files

| File | Change |
|------|--------|
| `apps/executor/src/services/execution-engine.ts` | Replace mock tradeService with TradeQueuePublisher |
| `apps/executor/src/workers/executor.ts` | Pass TradeQueuePublisher to ExecutionEngine |
| `apps/jobs-worker/src/index.ts` | Start/stop TradeQueueProcessor |
| `apps/jobs-worker/src/queues/connection.ts` | Export Redis client for processor |
