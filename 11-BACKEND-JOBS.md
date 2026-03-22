# Backend Jobs: FlashRoute

---

## Overview

Background jobs processed by BullMQ workers. Handles non-latency-critical tasks: analytics aggregation, cleanup, email delivery, alerting, and competitor tracking.

**Files:** `src/jobs/queues.ts` (queue definitions), `src/jobs/processors/` (one file per job), `src/workers/jobs-worker.ts`
**Estimated LOC:** 2,000-2,500

---

## Queue Definitions (src/jobs/queues.ts)

| Queue | Concurrency | Purpose |
|---|---|---|
| analytics | 1 | Daily analytics aggregation, pool snapshot capture |
| email | 3 | Transactional email delivery |
| alerts | 5 | Alert evaluation and delivery |
| cleanup | 1 | Data archival, expired record cleanup |
| competitor | 1 | Competitor bot activity tracking |

---

## Job Specifications

### Job: aggregateDailyAnalytics
**Queue:** analytics | **Schedule:** Every day at 00:05 UTC (cron: `5 0 * * *`) | **Retry:** 3 times, 5 min backoff

**Steps:**
1. For each user with active strategies:
   - Query trades for yesterday: `WHERE user_id = $1 AND created_at >= yesterday AND created_at < today`
   - Aggregate: total_trades, successful, failed, total_profit, total_gas, avg_profit, max_profit, avg_execution_time
   - Find most_profitable_route from trade with max net_profit
   - Calculate demand_prediction_hit_rate: profitable trades using prediction / total prediction trades
   - Upsert into daily_analytics table
2. Log completion: `Aggregated analytics for {N} users, {date}`

### Job: capturePoolSnapshots
**Queue:** analytics | **Schedule:** Every 5 minutes (cron: `*/5 * * * *`) | **Retry:** 2 times

**Steps:**
1. For each active chain:
   - Get top 100 pools by TVL
   - Read current reserves from Redis
   - Batch insert into pool_snapshots table
2. Prune snapshots older than 30 days: `DELETE FROM pool_snapshots WHERE created_at < NOW() - INTERVAL '30 days'`

### Job: sendEmail
**Queue:** email | **Trigger:** Event-driven | **Retry:** 3 times, exponential backoff (1min, 5min, 15min)

**Types:**
- `send-verification`: Subject "Verify your FlashRoute email", contains verification link
- `send-password-reset`: Subject "Reset your FlashRoute password", contains reset link
- `send-payment-failed`: Subject "Payment failed — update your billing", contains portal link
- `send-trade-report`: Subject "Your weekly FlashRoute report", contains profit summary

**Implementation:** Use Resend SDK or Nodemailer with SMTP. Template system with handlebars-style variables.

### Job: evaluateAlerts
**Queue:** alerts | **Trigger:** On `fr:execution:result` and `fr:system:alert` Redis events | **Retry:** 1 time

**Steps:**
1. Receive event (trade result, system alert, etc.)
2. Query active alerts matching event type, chain, strategy
3. For each matching alert:
   - Check threshold (if applicable): e.g., trade.netProfitUsd >= alert.thresholdValue
   - Check cooldown: last_triggered_at + cooldown_seconds < NOW()
   - If passes all checks: deliver alert
4. Delivery by channel:
   - **dashboard:** Publish to WebSocket via Redis pub/sub `fr:ws:alert:{userId}`
   - **email:** Queue sendEmail job
   - **telegram:** POST to `https://api.telegram.org/bot{token}/sendMessage` with chat_id and formatted message
   - **webhook:** POST to alert.deliveryConfig.webhookUrl with JSON payload, timeout 10s
5. Record in alert_history table
6. Update alert: last_triggered_at, trigger_count++

### Job: trackCompetitors
**Queue:** competitor | **Schedule:** Every block (triggered by analytics engine) | **Retry:** 1 time

**Steps:**
1. For each new block on each chain:
   - Scan transactions for known arbitrage patterns:
     - Flash loan initiation (Aave flashLoan, Balancer flashLoan function signatures)
     - Multi-hop swap sequences
     - Profit extraction (token transfers back to bot address)
   - For each detected arb tx:
     - Decode route path
     - Estimate profit from token transfer events
     - Record in competitor_activity table
2. Aggregate: update competitor bot profiles (trade count, estimated profit, most used routes)

### Job: cleanupExpiredData
**Queue:** cleanup | **Schedule:** Daily at 03:00 UTC | **Retry:** 2 times

**Steps:**
1. Delete expired refresh_tokens: `WHERE expires_at < NOW() AND revoked_at IS NOT NULL`
2. Delete old audit_logs: `WHERE created_at < NOW() - INTERVAL '90 days'`
3. Archive old trades: move trades older than 90 days to trades_archive table
4. Delete old competitor_activity: `WHERE created_at < NOW() - INTERVAL '30 days'`
5. Delete old alert_history: `WHERE created_at < NOW() - INTERVAL '30 days'`
6. Vacuum tables after bulk deletes (if PostgreSQL auto-vacuum hasn't run recently)
7. Log: `Cleanup complete. Deleted: {refreshTokens}, {auditLogs}; Archived: {trades}`

### Job: sweepProfitsJob
**Queue:** analytics | **Trigger:** Every 100 blocks or on balance threshold | **Retry:** 3 times

Calls ProfitSweeperService.sweepProfits() for each active chain.

---

## Jobs Worker (src/workers/jobs-worker.ts)

**Startup:**
1. Initialize all queue processors
2. Register scheduled jobs (cron expressions)
3. Subscribe to Redis events for event-triggered jobs
4. Log: "Jobs worker started. Processing {N} queues."

**Graceful shutdown:** Wait for active jobs to complete (max 30 seconds), then close queues.

---

## Test Cases (10 cases)

| # | Test | Expected | Validates |
|---|---|---|---|
| 1 | Daily analytics aggregation | daily_analytics row created per user per chain | Aggregation |
| 2 | Pool snapshot capture | 100 snapshots inserted | Snapshots |
| 3 | Pool snapshot pruning | Records > 30 days deleted | Retention |
| 4 | Email delivery | Resend API called with correct template | Email |
| 5 | Alert evaluation — threshold met | Alert delivered via configured channel | Alert triggering |
| 6 | Alert evaluation — cooldown active | Alert skipped | Cooldown |
| 7 | Telegram alert delivery | Telegram API called with formatted message | Telegram integration |
| 8 | Webhook alert delivery | POST to webhook URL with JSON | Webhook delivery |
| 9 | Competitor tracking | Arb tx detected in block, recorded in competitor_activity | Competition tracking |
| 10 | Expired data cleanup | Old records deleted, trades archived | Data lifecycle |


---

## Queue Topology, Idempotency, and Operational Constraints

Jobs in FlashRoute are support infrastructure for a latency-sensitive trading engine. They must therefore be designed to **never interfere with the hot path** and to be safe under retries.

### Queue options

Each BullMQ queue should define:

- `removeOnComplete` with bounded history (for example 5000),
- `removeOnFail` with longer retention for debugging,
- per-queue default attempts/backoff,
- rate limits for integrations such as email and Telegram,
- unique `jobId` for naturally idempotent workloads.

Examples:

- `aggregateDailyAnalytics:{date}` as unique job id,
- `capturePoolSnapshots:{chainId}:{bucketTimestamp}`,
- `sendEmail:{template}:{target}:{dedupeKey}`,
- `cleanupExpiredData:{yyyy-mm-dd}`.

If a repeated scheduler fires twice, BullMQ should collapse duplicates instead of double-processing.

## Job Payload Contracts

Every processor should accept typed payloads that include `requestId`/`correlationId` where relevant. Example for alert delivery:

```ts
{
  userId: string,
  alertId: string,
  eventType: 'trade_result' | 'system_alert',
  eventRefId: string,
  channel: 'dashboard' | 'email' | 'telegram' | 'webhook',
  payloadVersion: 1
}
```

This makes downstream debugging possible when a user reports “I got three alerts for one trade.”

## Detailed Processor Rules

### aggregateDailyAnalytics

Run in a transaction per user+day. If one user aggregation fails, continue with others and record partial failure summary. Derived metrics should include:

- win rate,
- median net profit,
- P95 execution latency,
- total reverted gas cost,
- chain breakdown JSON,
- best hour-of-day histogram.

Use SQL aggregation when possible; do not load thousands of trades into application memory per user unnecessarily.

### capturePoolSnapshots

Snapshot rows should be bucketed by timestamp rounded to 5-minute intervals. If multiple runs occur inside same bucket, upsert rather than insert duplicates. Only snapshot pools with fresh Redis state; missing state should be counted in metrics and skipped.

### evaluateAlerts

Alert delivery must be de-duplicated by `(alertId, eventRefId, channel)`. Write history before external delivery with status `pending`, then update to `delivered` or `failed`. This prevents duplicate sends on worker crash/retry and gives visibility into partial failures.

### trackCompetitors

Competitor tracking should classify bot behavior using heuristics:

- recurring sender or contract address,
- presence of flash loan callback patterns,
- swaps across 2+ pools in one transaction,
- same sender profitability over time.

Store confidence per detected competitor event. Do not present all detected arbitrage as ground truth; some complex liquidations look similar.

### cleanupExpiredData

Archival must happen in bounded batches, not one huge delete. Example:

1. move 10k old trade rows at a time into archive table,
2. delete moved ids,
3. sleep or yield briefly between batches if load is high,
4. emit progress logs.

This avoids long table locks and I/O spikes.

## Worker Lifecycle and Monitoring

`jobs-worker.ts` should expose heartbeats by setting `fr:heartbeat:jobs-worker` every 30 seconds with payload:

```json
{ "updatedAt": "...", "queues": ["analytics","email","alerts","cleanup","competitor"], "activeJobs": 4 }
```

It should also publish metrics:

- queue depth,
- oldest waiting job age,
- failure count by processor,
- average processing time,
- external delivery error rate.

Admin health endpoints can then mark queues degraded before they fully stall.

## Failure Handling Principles

- Email, Telegram, and webhook jobs are retryable with exponential backoff.
- Internal aggregation jobs are retryable only if they are idempotent.
- Cleanup jobs must be resumable from last processed id or time bucket.
- Jobs that can cause money movement, such as `sweepProfitsJob`, should acquire distributed locks so only one sweep runs per chain.

The implementation detail that matters: retries should never create duplicate user-visible side effects or duplicate accounting rows.


## Scheduling and Concurrency Notes

Cron-backed jobs should be registered by exactly one scheduler instance in production to avoid duplicate repeatable jobs. If multiple jobs workers may run, designate one leader via Redis lock for schedule registration while all workers remain eligible to process queued work.

Per-queue concurrency should remain intentionally low for DB-heavy processors. The point is predictable background throughput, not maximizing parallelism at the expense of database contention.

## Additional Test Cases

11. Duplicate repeatable job registration attempt → only one logical job enqueued.
12. Alert delivery retry after webhook 500 → one final delivered history row, no duplicates.
13. Cleanup batch resume after simulated crash → continues from checkpoint, no double-archive.
