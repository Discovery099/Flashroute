# F4 — Trade Finalization: Design

## Context

Phase F (Execution Engine) has built the backend for executing arbitrage trades. F4 is the final task in Phase F — it wires execution results back into the existing product surfaces: Postgres persistence, WebSocket live updates, and analytics aggregation.

The executor currently uses a **mock** `tradeService` (hardcoded in `apps/executor/src/workers/executor.ts`). F4 replaces this with the real `TradeQueuePublisher` and implements the consumer in `jobs-worker` that bridges to the API and WebSocket layer.

## Decisions Made

1. **Queue: Stay with Redis List (LPUSH/BRPOP)** — Already implemented in `TradeQueuePublisher`. Trade flow is idempotent, so Streams' acknowledgement semantics add complexity without clear benefit.
2. **Executor → Queue (not direct API calls)** — Executor publishes `create`/`update` messages to `fr:trades:queue` via `TradeQueuePublisher`. jobs-worker consumer reads from the queue and calls the API. Executor never calls the API directly.
3. **Analytics: Cron only** — Settled trades with actual profit flow into the existing `aggregateDailyAnalytics` cron job (runs 00:05 daily). No change to the analytics pipeline.

## Architecture

```
Executor                     jobs-worker                 API                  WebSocket
  │                               │                       │                        │
  │ publishCreateTrade()          │                       │                        │
  │─────────────────────────────►│                       │                        │
  │                               │ createTrade()         │                        │
  │                               │──────────────────────►│                        │
  │                               │                       │                        │
  │ recordResult(included)         │                       │                        │
  │ publishUpdateTrade()          │                       │                        │
  │─────────────────────────────►│                       │                        │
  │                               │ updateStatus()        │                        │
  │                               │──────────────────────►│                        │
  │                               │                       │ publish trades:live     │
  │                               │                       │────────────────────────►│ Dashboard
  │                               │                       │                        │
settled (block monitoring)        │                       │                        │
  │ publishUpdateTrade(settled)  │                       │                        │
  │─────────────────────────────►│                       │                        │
  │                               │ updateStatus()        │                        │
  │                               │──────────────────────►│                        │
  │                               │                       │ publish trades:live     │
  │                               │                       │────────────────────────►│
  │                               │                       │                        │
Daily cron: aggregateDailyAnalytics reads settled trades from Postgres
```

## Components

### 1. Wire TradeQueuePublisher into Executor

**File:** `apps/executor/src/services/execution-engine.ts`

Replace the mock `tradeService` with `TradeQueuePublisher`:
- `createTrade(payload)` → `publishCreateTrade(payload)` at submission time
- `updateTrade(tradeId, payload)` → `publishUpdateTrade(tradeId, payload)` on include/revert/fail

**File:** `apps/executor/src/workers/executor.ts`

Pass `TradeQueuePublisher` instance into `ExecutionEngine`.

### 2. jobs-worker TradeQueueProcessor

**File:** `apps/jobs-worker/src/modules/trade-queue.processor.ts`

A standalone `BRPOP` loop (NOT a BullMQ processor — BullMQ expects `queue.add()`, but the executor publishes directly to a raw Redis list via LPUSH):

```typescript
class TradeQueueProcessor {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      const result = await this.redis.brpop('fr:trades:queue', 5);
      if (result) {
        const [, message] = result;
        await this.processMessage(message);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async processMessage(message: string): Promise<void> {
    // Parse, call API, publish to trades:live
  }
}
```

**Responsibilities:**
1. `BRPOP` from `fr:trades:queue` with 5s timeout
2. Parse `TradeCreateMessage` or `TradeUpdateMessage`
3. Call `TradesService.create()` or `TradesService.updateStatus()` via internal API client
4. Publish trade update to `fr:trades:live` pub/sub so WebSocket gateway fans out
5. On API failure: leave message in list (don't delete) — BRPOP will re-deliver
6. On parse failure: log and skip (dead-letter to `fr:trades:dead`)

### 3. API Client in jobs-worker

**File:** `apps/jobs-worker/src/modules/trade-api.client.ts`

Internal HTTP client to call API endpoints:
- `POST /internal/trades` — create trade
- `PATCH /internal/trades/:id/status` — update status

Uses the existing API internal endpoints (not public API — those require auth).

### 4. Wire into jobs-worker main()

**File:** `apps/jobs-worker/src/index.ts`

Register `TradeQueueProcessor` alongside existing job schedulers.

### 5. Publish to trades:live

After successful API call, the consumer publishes to `fr:trades:live` (Redis pub/sub, not streams):

```json
{ "event": "trade_update", "tradeId": "...", "status": "included", "chainId": 1, "updatedAt": "..." }
```

The existing `LiveGateway` in `apps/api/src/modules/live/live.gateway.ts` is already subscribed to `trades:live` — no changes needed there.

## Message Formats

### fr:trades:queue (Redis List)

**Create message:**
```json
{
  "type": "create",
  "payload": {
    "strategyId": "uuid",
    "chainId": 1,
    "routePath": "0x→0x→0x",
    "routeHops": 3,
    "flashLoanProvider": "balancer",
    "flashLoanToken": "0x...",
    "flashLoanAmount": "1000000",
    "flashLoanFee": "1000",
    "simulatedProfitUsd": 150.50,
    "executionTimeMs": 234,
    "status": "submitted_public"
  }
}
```

**Update message:**
```json
{
  "type": "update",
  "tradeId": "trade-123",
  "payload": {
    "status": "included",
    "txHash": "0x...",
    "blockNumber": 12345678,
    "submittedAt": "2026-03-28T12:00:00Z"
  }
}
```

### fr:trades:live (Redis Pub/Sub)

```json
{
  "event": "trade_update",
  "tradeId": "trade-123",
  "status": "settled",
  "profitUsd": 142.30,
  "chainId": 1,
  "updatedAt": "2026-03-28T12:05:00Z"
}
```

## Error Handling

| Failure | Handling |
|---------|----------|
| API call fails | Message stays in list; BRPOP re-delivers on next poll |
| Parse fails | Log + skip; optionally move to `fr:trades:dead` |
| Redis connection drops | Exponential backoff reconnect |

## Testing

1. **Unit tests** for `TradeQueueProcessor.processMessage()` — mock Redis, mock API client
2. **Unit tests** for `TradeApiClient` — mock fetch/axios
3. **Integration test** — real Redis list, real API calls (can use test database)

## Out of Scope (Post-F4)

- Profit decoding from on-chain `ExecutionResult` events (executor decodes contract receipt for actual profit on settle)
- Dead-letter queue UI in admin dashboard
- Retry backoff with max attempts
