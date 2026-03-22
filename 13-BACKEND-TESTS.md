# Backend Tests: FlashRoute

---

## Overview

Complete test specification covering unit tests, integration tests, and end-to-end test scenarios. Tests use Jest + Supertest with mocked blockchain providers and Stripe.

**Estimated LOC:** 8,000-12,000 (tests are verbose by design)

---

## Test Infrastructure

### Test Database
- Separate PostgreSQL database: `flashroute_test`
- Prisma migrations applied before test suite
- Database truncated between test files (not between individual tests — use transactions for isolation)

### Test Redis
- Separate Redis database: `SELECT 1` (test) vs `SELECT 0` (development)
- Flushed between test files

### Mock Providers

**Ethereum Provider Mock:**
```typescript
// Mock that returns:
// - getBlock(): configurable block with transactions
// - getTransaction(): configurable pending tx
// - getTransactionReceipt(): configurable receipt (success/revert)
// - getBalance(): configurable balance
// - call(): configurable return data (for multicall, getReserves, etc.)
// - sendTransaction(): returns configurable tx hash
// Does NOT connect to real blockchain
```

**Flashbots Provider Mock:**
```typescript
// Mock that returns:
// - simulate(): configurable simulation result
// - sendBundle(): configurable bundle hash
// - getBundleStatsV2(): configurable inclusion status
```

**Stripe Mock:**
```typescript
// Use stripe-mock Docker container OR manual mocks:
// - customers.create(): returns mock customer
// - checkout.sessions.create(): returns mock session with URL
// - billingPortal.sessions.create(): returns mock portal URL
// - webhooks.constructEvent(): validates test signatures
```

### Test Data Factories

```typescript
// createTestUser(overrides?): Creates user with defaults, returns { user, accessToken, refreshToken }
// createTestStrategy(userId, overrides?): Creates strategy with defaults
// createTestTrade(strategyId, overrides?): Creates trade record
// createTestPool(chainId, overrides?): Creates pool with tokens
// createTestPendingTx(overrides?): Creates decoded pending swap
// mockPoolState(poolAddress, reserves): Sets up Redis pool state
// mockGraphWithCycle(profitRatio): Creates graph with a planted arbitrage cycle
```

---

## Unit Test Specifications

### AMM Price Calculator Tests (30 cases)

**Uniswap V2 (10 cases):**
1. Standard swap: 1 ETH with balanced pool → verify output matches formula
2. Large swap: 100 ETH → verify high slippage
3. Tiny swap: 0.001 ETH → verify near-zero slippage
4. Zero input → returns 0
5. Pool with different fee (SushiSwap 0.3% vs custom 0.25%) → correct fee applied
6. Very imbalanced pool (99:1 ratio) → correct output
7. Max uint256 input → no overflow (use BigInt)
8. Reverse direction (token1→token0) → correct calculation
9. Price impact percentage → matches expected formula
10. Post-swap reserves → conservation check (new reserves still satisfy k)

**Uniswap V3 (8 cases):**
1. Single-tick swap → correct output using sqrtPrice math
2. Multi-tick swap (crosses 3 ticks) → sum of per-tick outputs
3. Swap exactly to tick boundary → boundary handling
4. Empty tick range → partial fill
5. Different fee tiers (0.01%, 0.05%, 0.3%, 1%) → correct fee deduction
6. Zero liquidity at current tick → no output
7. Negative tick indices → correct math
8. sqrtPriceX96 conversion to human price → accuracy check

**Curve (7 cases):**
1. Balanced 3-pool swap → near 1:1 output
2. Imbalanced pool → higher slippage
3. Different amplification factors (A=100, A=2000) → verify curve shape
4. Newton convergence → converges within 255 iterations
5. Very large swap (10% of pool) → correct output
6. 2-token pool vs 3-token pool → correct n parameter
7. Exchange underlying → correct calculation for metapools

**Balancer (5 cases):**
1. 50/50 pool → matches constant product
2. 80/20 pool → asymmetric pricing correct
3. 60/20/20 3-token pool → correct output
4. High fee pool (3%) → fee correctly deducted
5. Swap between non-adjacent tokens in multi-token pool → correct weight application

### Graph Builder Tests (10 cases)

1. Build from 5 V2 pools → correct vertex count, edge count (2 per pool)
2. Multiple pools for same pair → all represented as separate edges
3. Pool with zero reserves → excluded from graph
4. Edge weight calculation → matches -ln(rate)
5. Incremental update → only affected edges change
6. Mixed DEX types in same graph → all correctly weighted
7. Blacklisted token pool → excluded
8. Pool below TVL threshold → excluded
9. Graph stats accuracy → total tokens, pools, edges match
10. Full rebuild matches incremental → same graph produced both ways

### Route Discovery Tests (10 cases)

1. Simple triangle (3 tokens, 3 pools) with 1% arb → found
2. No arbitrage (all rates = 1.0) → empty result
3. 4-hop cycle → found when maxHops >= 4
4. 5-hop exceeds maxHops=4 → not found
5. Multiple cycles → all found and ranked by profit
6. Cycle deduplication → rotations detected
7. Performance: 500 tokens, 2000 edges → completes in <500ms
8. Source token priority → WETH cycles found before obscure tokens
9. Minimum profit filter → cycles below threshold excluded
10. Graph not dirty → returns cached results

### Demand Prediction Tests (8 cases)

1. Decode V2 swap → correct tokenIn, tokenOut, amountIn
2. Decode V3 multicall → nested swaps extracted
3. Non-DEX tx → returns null
4. Impact calculation → correct reserve changes
5. Multiple pending swaps same pool → cumulative impact
6. Confidence scoring → high gas tip = high confidence
7. Prediction overlay on graph → edge weights updated
8. Stale prediction removed → cleaned up after block confirmation

### Profit Simulation Tests (8 cases)

1. Profitable 2-hop route → positive netProfitUsd
2. Unprofitable after gas → profitable=false
3. Optimal amount search → converges to peak profit
4. Provider selection → cheapest available chosen
5. Risk buffer calculation → scales with congestion
6. Pool state continuity → second hop uses updated reserves from first
7. Demand prediction applied → profit changes vs. current-state simulation
8. Gas estimation → matches per-hop gas table

---

## Integration Test Specifications

### Auth Flow (8 cases)
1. Full registration → verify email → login → access protected endpoint → refresh token → logout
2. Registration with duplicate email → 409
3. Login with wrong password 5 times → account locked → unlock after 30 min
4. 2FA setup → verify → login requires code → disable
5. Password reset flow → old password no longer works → new password works
6. API key creation → use API key for auth → revoke → key no longer works
7. Expired access token → 401 → refresh → new token works
8. Refresh token reuse → all family tokens revoked

### Strategy Management (5 cases)
1. Create strategy → activate → deactivate → delete
2. Create as monitor tier → 403 TIER_LIMIT
3. Activate with invalid chain → 404
4. Update active strategy → auto-deactivated first
5. Max strategy limit reached → 403

### Trade & Analytics (5 cases)
1. Record trade → query trade list → verify fields
2. Trade summary aggregation → correct totals
3. Filter trades by date range, chain, strategy
4. Daily analytics query → matches aggregated data
5. Competitor activity query → returns tracked bots

### Billing (4 cases)
1. Create checkout → webhook completes → role upgraded
2. Subscription cancelled → role downgraded → strategies paused
3. Payment failed → status past_due → payment succeeds → status active
4. Portal session → returns valid Stripe URL

---

## End-to-End Test Scenarios

### Scenario 1: Full Arbitrage Cycle (mocked blockchain)
1. Setup: 3 pools with planted arbitrage opportunity
2. Pool indexer syncs pools → graph built
3. Route discovery finds cycle → published to Redis
4. Executor receives cycle → simulates → profitable
5. Transaction constructed → Flashbots simulation succeeds → bundle submitted (mocked)
6. Block arrives with our tx → receipt confirms success → profit recorded
7. Dashboard API returns the trade in trade list
8. Daily analytics job aggregates the trade

### Scenario 2: Failed Execution Recovery
1. Setup: profitable route, but Flashbots simulation reverts
2. Verify: trade recorded with status='failed', error logged
3. Verify: strategy NOT paused (single failure)
4. Setup: 4 more consecutive failures
5. Verify: strategy paused, system alert published

### Scenario 3: Subscription Lifecycle
1. New user registers (monitor tier)
2. Creates checkout → subscribes to executor tier
3. Creates and activates strategy
4. Subscription cancelled
5. Verify: strategy deactivated, role downgraded, execution stops

---

## Coverage Targets

| Layer | Target |
|---|---|
| Services (business logic) | 90%+ |
| Controllers (route handlers) | 85%+ |
| Utilities | 95%+ |
| Middleware | 90%+ |
| Overall | 85%+ |


---

## Integration Test Strategy and Determinism Rules

The backend test suite needs to prove correctness for three very different domains at once: finance math, distributed worker coordination, and SaaS account controls. The only way to keep this reliable is to enforce deterministic tests.

### Determinism rules

1. Freeze time in tests that involve JWT expiry, TOTP windows, billing periods, and scheduled jobs.
2. Use fixed block numbers and fixed gas prices in blockchain mocks.
3. Seed UUIDs and random token generators where assertions depend on output shape.
4. Never depend on external RPC, Stripe live API, or real Telegram delivery.
5. Reset Redis keys by namespace between suites so leftover pub/sub state does not leak.

## Additional Integration Suites

### Auth + Billing coupling (6 cases)
1. Upgrade to executor tier → login response entitlements reflect executor immediately after webhook processing.
2. Downgrade to monitor → API key with execute scope becomes unusable for protected routes.
3. Password reset → all refresh token families revoked, billing record unaffected.
4. Admin impersonation token → can view user billing page but cannot create checkout or mutate execution settings.
5. 2FA enabled executor user → strategy activation route requires fresh authenticated session.
6. Past-due subscription in grace period → read routes allowed, live activation denied.

### Worker coordination (6 cases)
1. Pool update event published → graph builder consumes once and recalculates only affected edges.
2. Route discovered event published twice with same signature → executor processes once due to dedupe/lock.
3. `fr:config:changed` event toggles maintenance mode → executor declines new opportunities within one polling cycle.
4. Jobs worker heartbeat stale → admin health reports degraded.
5. Submission result event → alert evaluator sends one dashboard alert and one audit row.
6. Restart reconciliation → submitted-but-unconfirmed trade restored and tracked to final state.

### Billing webhook ordering (5 cases)
1. `invoice.paid` arrives before `customer.subscription.updated` → final DB state still active and correct.
2. Duplicate webhook event id delivered twice → second delivery no-ops.
3. Older subscription.updated event arrives after newer one → stale update ignored.
4. Webhook DB transaction fails after Stripe verification → event remains retryable and no partial role change persists.
5. Cancellation at period end → entitlements remain until period boundary then downgrade job applies.

## Property and Fuzz Testing Targets

Several components benefit from generated-input tests rather than only curated examples.

### AMM math properties

- output is never negative,
- larger exact-in swap on same state yields non-decreasing output amount but worse marginal price,
- post-swap reserves remain within valid domain,
- fees collected are non-negative,
- V2 invariant does not decrease after fee-adjusted trade.

### Route discovery properties

- canonical signature of a rotated cycle is identical,
- no returned route exceeds configured max hops,
- route start token equals route end token,
- dedupe does not drop distinct routes that share token sequence but use different pools.

### Auth properties

- refresh token reuse always revokes family,
- expired tokens never authenticate,
- API key comparison is constant-time from public API perspective (timing budget broad check).

## End-to-End Assertions That Matter

E2E tests should assert not only HTTP responses but system side effects:

- Redis keys written,
- pub/sub events emitted,
- audit rows created,
- strategy status changes,
- trade rows updated through final state,
- queue jobs enqueued with expected payload.

Example for full arbitrage cycle scenario:

1. assert route published with correlation id,
2. assert execution lock acquired then released,
3. assert trade moved `detected -> simulated -> submitted_private -> included -> settled`,
4. assert profit analytics aggregate reflects the settled trade,
5. assert websocket payload for dashboard summary emitted.

## Coverage Distribution Expectations

High overall coverage is not enough if critical money-moving code is under-tested. Minimum expectations:

- profit simulator and execution engine branches: 95%+,
- auth token rotation logic: 95%+,
- billing webhook handlers: 90%+ with event matrix coverage,
- admin runtime config validation: 90%+,
- pure UI-oriented DTO mappers can be lower if necessary.

The important outcome is confidence in correctness around capital risk and access control, not chasing a vanity total.
