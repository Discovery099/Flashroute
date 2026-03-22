# Backend Core 2: Demand Prediction & Mempool Engine

---

## Overview

This file specifies the mempool monitoring system that gives FlashRoute its predictive edge: watching pending transactions, decoding DEX swaps, simulating their impact on pool states, and projecting future arbitrage opportunities before they materialize.

**Files created:** 4 files
**Estimated LOC:** 3,000-4,000

---

## Files

```
src/services/mempoolMonitor.service.ts    # Pending transaction streaming and filtering
src/services/txDecoder.service.ts         # DEX swap calldata decoding
src/services/demandPredictor.service.ts   # Impact simulation and state projection
src/workers/mempool-worker.ts             # Worker entry point
```

---

## MempoolMonitorService (src/services/mempoolMonitor.service.ts)

### Internal State

```typescript
// pendingTxs: LRUCache<string, PendingTransaction>  // txHash → decoded tx, max 10000 entries
// seenHashes: Set<string>                            // dedup filter, rotated every 60 seconds
// subscriptionActive: boolean
// reconnectAttempts: number
```

### Method: start(chainId: number): Promise<void>

**Purpose:** Start streaming pending transactions from the Ethereum node.

**Steps:**
1. Connect to node via WebSocket: `provider.send('eth_subscribe', ['newPendingTransactions'])`
2. On each transaction hash received:
   - If already in seenHashes: skip (dedup)
   - Add to seenHashes
   - Fetch full transaction: `provider.getTransaction(txHash)`
   - If tx is null (already mined or dropped): skip
   - Pass to processPendingTransaction()
3. On WebSocket disconnect:
   - Log warning
   - Attempt reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
   - After 10 failed reconnects: publish system alert, switch to polling mode

### Method: processPendingTransaction(tx: Transaction): Promise<void>

**Steps:**
1. Quick filter: if tx.to is not a known DEX router address → skip (saves 90% of processing)
2. Pass to TxDecoderService.decode(tx)
3. If decode returns null (not a swap): skip
4. If decoded swap involves blacklisted tokens: skip
5. Store in pendingTxs LRU cache
6. Publish to Redis: `fr:pending:swap` channel with decoded swap details
7. Log at debug level: `Pending swap: {dex} {tokenIn}→{tokenOut} amount={amountIn}`

### Method: getActivePendingSwaps(chainId: number): PendingSwap[]

**Purpose:** Return all current pending swaps for API and demand predictor.

**Steps:**
1. Return all entries from pendingTxs cache
2. Filter out entries older than 60 seconds (likely already mined or dropped)
3. Sort by confidence score descending

### Method: removePendingTx(txHash: string): void

**Purpose:** Remove a pending tx when it's included in a block or cancelled.

Called by the analytics engine when a new block arrives — cross-reference block transactions against pending cache and remove matches.

---

## TxDecoderService (src/services/txDecoder.service.ts)

### Method: decode(tx: Transaction): DecodedSwap | null

**Purpose:** Decode a transaction's calldata to extract DEX swap information.

**Steps:**
1. Extract function selector: `tx.data.slice(0, 10)`
2. Match against known selectors (from constants.ts):

**Uniswap V2 Router decoders:**

| Selector | Method | Decode Strategy |
|---|---|---|
| 0x38ed1739 | swapExactTokensForTokens | ABI decode: (amountIn, amountOutMin, path[], to, deadline) |
| 0x8803dbee | swapTokensForExactTokens | ABI decode: (amountOut, amountInMax, path[], to, deadline) |
| 0x7ff36ab5 | swapExactETHForTokens | ABI decode: (amountOutMin, path[], to, deadline); amountIn = tx.value |
| 0x18cbafe5 | swapExactTokensForETH | ABI decode: (amountIn, amountOutMin, path[], to, deadline) |
| 0xfb3bdb41 | swapETHForExactTokens | ABI decode: (amountOut, path[], to, deadline); amountIn = tx.value |

**Uniswap V3 Router decoders:**

| Selector | Method | Decode Strategy |
|---|---|---|
| 0x5ae401dc | multicall(uint256,bytes[]) | Decode deadline + bytes array; recursively decode each inner call |
| 0xac9650d8 | multicall(bytes[]) | Decode bytes array; recursively decode each inner call |

Inner V3 call selectors:
- 0x04e45aaf → exactInputSingle(params): decode tokenIn, tokenOut, fee, amountIn, amountOutMin
- 0xb858183f → exactInput(params): decode path (packed bytes: token0+fee+token1+fee+token2...), amountIn
- 0x5023b4df → exactOutputSingle(params): decode tokenIn, tokenOut, fee, amountOut, amountInMax
- 0x09b81346 → exactOutput(params): decode path (reversed), amountOut

**Universal Router decoder:**

| Selector | Method | Decode Strategy |
|---|---|---|
| 0x3593564c | execute(bytes,bytes[],uint256) | Decode commands byte string; for each command byte, decode corresponding input |

Command bytes: 0x00 = V3_SWAP_EXACT_IN, 0x01 = V3_SWAP_EXACT_OUT, 0x08 = V2_SWAP_EXACT_IN, 0x09 = V2_SWAP_EXACT_OUT

**Curve decoder:**

| Selector | Method | Decode Strategy |
|---|---|---|
| 0xa6417ed6 | exchange(i, j, dx, min_dy) | Decode token indices + amounts; look up actual token addresses from pool config |
| 0x394747c5 | exchange_underlying(i, j, dx, min_dy) | Same but for underlying tokens in metapools |

**Balancer decoder:**

| Selector | Method | Decode Strategy |
|---|---|---|
| 0x52bbbe29 | swap(SingleSwap, FundManagement, limit, deadline) | Decode struct with poolId, assetIn, assetOut, amount |
| 0x945bcec9 | batchSwap(kind, swaps[], assets[], funds, limits[], deadline) | Decode batch with multiple hops |

3. If selector not recognized: check if tx.to is a known aggregator (1inch, 0x, Paraswap)
   - Aggregator transactions are complex; attempt partial decode
   - Mark confidence as lower (0.5x) for partially decoded transactions
4. Return DecodedSwap object:

```typescript
{
  txHash: string,
  dex: string,              // 'uniswap_v2', 'uniswap_v3', 'curve', 'balancer', 'aggregator'
  method: string,           // decoded method name
  swaps: [{                 // one entry per hop
    tokenIn: string,        // token address
    tokenOut: string,
    amountIn: bigint,       // exact or estimated
    amountOutMin: bigint,   // slippage tolerance
    pool?: string,          // pool address if determinable
    fee?: number            // fee tier (V3)
  }],
  sender: string,           // tx.from
  gasPrice: bigint,
  maxFeePerGas?: bigint,
  maxPriorityFeePerGas?: bigint,
  nonce: number,
  decodedAt: number,        // timestamp
  confidence: number        // 0.0-1.0
}
```

### Method: decodeV3Path(pathBytes: string): { tokenIn, fee, tokenOut }[]

**Purpose:** Decode Uniswap V3 packed path format.

V3 paths are encoded as: `tokenA (20 bytes) + fee (3 bytes) + tokenB (20 bytes) + fee (3 bytes) + tokenC (20 bytes)...`

**Steps:**
1. Read first 20 bytes → tokenIn address
2. Read next 3 bytes → fee tier (uint24)
3. Read next 20 bytes → tokenOut address
4. If more bytes remain: repeat from step 2
5. Return array of hops

---

## DemandPredictorService (src/services/demandPredictor.service.ts)

### Method: predictImpact(chainId: number): Promise<DemandPrediction[]>

**Purpose:** Take all active pending swaps and predict their cumulative impact on pool states.

**Steps:**
1. Get all pending swaps from MempoolMonitorService.getActivePendingSwaps()
2. Filter by confidence >= config.confidenceThreshold (default 0.3)
3. Sort by confidence descending (most likely to be included first)
4. Clone current pool states from Redis into memory (working copy)
5. For each pending swap (in order):
   - Simulate the swap against working pool states using AMM Price Calculator
   - Update working pool states with post-swap reserves
   - Track cumulative impact per pool
6. For each impacted pool, generate prediction:

```typescript
{
  poolAddress: string,
  chainId: number,
  currentReserves: { reserve0, reserve1 },
  predictedReserves: { reserve0, reserve1 },
  pendingSwapCount: number,
  totalPendingVolumeUsd: number,
  priceImpactPct: number,        // predicted price change
  direction: 'token0_to_token1' | 'token1_to_token0' | 'mixed',
  confidence: number,            // aggregate confidence
  contributingTxs: string[],     // tx hashes
  predictedAt: number
}
```

7. Publish predictions to Redis: `fr:demand:prediction` channel
8. Store in Redis hash: `fr:predictions:{chainId}` with pool address as field
9. Return predictions array

### Method: applyPredictionsToGraph(chainId: number, graph: Graph): Graph

**Purpose:** Overlay demand predictions onto the arbitrage graph to discover future opportunities.

**Steps:**
1. Get current predictions from Redis: `fr:predictions:{chainId}`
2. For each prediction with confidence > 0.5:
   - Calculate new edge weights using predicted reserves
   - Create a "predicted graph" variant with updated weights
3. Return the predicted graph (does not modify the actual graph)

The analytics engine then runs route discovery on BOTH the current graph and the predicted graph, finding opportunities that exist now AND opportunities that will exist after pending transactions execute.

### Method: getActivePredictions(chainId: number): DemandPrediction[]

**Purpose:** Read current predictions for the API.

---

## Mempool Worker (src/workers/mempool-worker.ts)

### Startup Sequence

1. Initialize logger with service='mempool-worker'
2. Connect to Redis
3. Initialize ChainManager → get active chains
4. For each active chain:
   - Create WebSocket connection to node
   - Start MempoolMonitorService.start(chainId)
5. Subscribe to `fr:pool:update` events (to refresh pool state cache used by demand predictor)
6. Set up periodic prediction cycle:
   - Every 2 seconds (or every new block on L2s): run DemandPredictorService.predictImpact()
7. Log: "Mempool worker started. Monitoring {N} chains."

### Cleanup

When a new block arrives:
1. Cross-reference block transactions with pending cache
2. Remove matched transactions (they're now confirmed)
3. Invalidate predictions for affected pools
4. Re-run prediction cycle with updated pending set

---

## Test Cases (15 cases)

| # | Test | Input | Expected | Validates |
|---|---|---|---|---|
| 1 | Decode V2 swapExactTokensForTokens | ABI-encoded calldata | Correct path, amountIn, amountOutMin | V2 decoding |
| 2 | Decode V2 swapExactETHForTokens | Calldata + tx.value | amountIn from tx.value | ETH swap decoding |
| 3 | Decode V3 multicall with exactInputSingle | Nested multicall bytes | Single swap decoded | V3 multicall |
| 4 | Decode V3 packed path | 0x{token0}{fee}{token1}{fee}{token2} | 2-hop path extracted | V3 path decoding |
| 5 | Decode Universal Router execute | Commands + inputs bytes | Swap extracted from command | Universal Router |
| 6 | Decode Curve exchange | exchange(i=0, j=1, dx, min_dy) | Token indices resolved to addresses | Curve decoding |
| 7 | Non-DEX transaction | ERC20 transfer calldata | Returns null | Filtering |
| 8 | Unknown selector on known router | Unknown method on Uniswap router | Returns partial decode, lower confidence | Fallback handling |
| 9 | Impact prediction single swap | 10 ETH pending swap on 1000-ETH pool | ~1% price impact predicted | Impact calculation |
| 10 | Impact prediction multiple swaps same pool | 3 pending swaps on same pool | Cumulative impact calculated | Aggregation |
| 11 | Impact prediction mixed directions | Buy + sell on same pool | Partial cancellation in impact | Direction handling |
| 12 | Pending tx cleanup on new block | 5 pending txs, 3 included in block | 3 removed, 2 remaining | Block reconciliation |
| 13 | Pending tx expiry | Tx in cache for 90 seconds | Excluded from predictions | TTL enforcement |
| 14 | LRU eviction at capacity | 10001st tx added (capacity 10000) | Oldest tx evicted | Memory management |
| 15 | Demand prediction overlay on graph | Predictions for 3 pools | Predicted graph has updated edge weights | Graph overlay |


---

## Pending Transaction Classification and Confidence Scoring

The mempool engine should not treat every decoded swap equally. Some pending transactions never land, some are replaced, and some are private and invisible. The system therefore needs a confidence model so demand prediction can be weighted instead of binary.

### Suggested confidence inputs

For each decoded pending swap, compute a `confidenceScore` from 0 to 1 using factors such as:

- sender nonce continuity (higher if nonce equals current account nonce),
- max fee per gas relative to current base fee,
- priority fee percentile,
- router reputation (official Uniswap router higher than unknown aggregator wrapper),
- calldata completeness and decoder certainty,
- transaction age in mempool,
- replacement history for same `(from, nonce)` tuple,
- whether transaction targets a highly congested block period.

A simple weighted formula is sufficient:

`score = 0.20*feeScore + 0.20*routerScore + 0.15*decodeScore + 0.15*nonceScore + 0.15*freshnessScore + 0.15*replacementPenaltyAdjusted`

The predictor should ignore entries below a low threshold like 0.25, aggregate weakly between 0.25 and 0.6, and prioritize strongly above 0.6.

## Replacement and Cancellation Handling

Mempool monitoring must group transactions by `(from, nonce, chainId)`. When a new tx arrives with the same from+nonce:

1. compare `maxFeePerGas`/`gasPrice`,
2. if replacement criteria are met, mark the older one `superseded`,
3. remove its projected impact from prediction caches,
4. insert the newer tx and recalculate affected pool projections.

If replacement calldata changes route entirely, predictions for old pools must be reversed before new projections apply. This is critical; otherwise the projected graph drifts away from plausible future state.

## Decoder Architecture

`TxDecoderService` should be adapter-driven. Implement one decoder per router family:

- `UniswapV2RouterDecoder`,
- `UniswapV3RouterDecoder`,
- `UniversalRouterDecoder`,
- `CurveRouterDecoder`,
- `BalancerVaultDecoder`,
- optional `AggregatorDecoder` for 1inch/0x if supported later.

Each decoder returns a normalized structure:

- `routerType`,
- `poolsTouched[]`,
- `path[]`,
- `amountIn`, `amountOutMin/amountOut`,
- `swapKind` (`exact_in`, `exact_out`),
- `recipient`,
- `deadline`,
- `confidence`,
- `warnings[]`.

For complex multicalls, return partial decodes when only some commands are understood. A partial decode is still useful for pool-impact prediction if touched pools and approximate direction are known.

## Demand Prediction Math

`predictImpact()` should maintain a temporary projected state map separate from canonical pool state.

### For constant-product pools

Given reserves `(x, y)`, fee `f`, and exact-in amount `dx`, compute:

- effective input `dxEff = dx * (1 - f)`,
- output `dy = (y * dxEff) / (x + dxEff)`,
- new reserves `(x + dxEff, y - dy)`.

Store both projected reserves and projected marginal price. If multiple swaps touch the same pool, apply them in descending confidence and gas-price order because higher-priced transactions are more likely to execute earlier.

### For V3 pools

Do not attempt a shortcut spot-price update if the predicted amount may cross ticks. Use the same tick-walk logic as the profit simulator but with lower precision and capped compute. If the transaction amount is too large for cheap approximation, mark the pool projection `lowPrecision=true` and reduce confidence of any route that depends on it.

### Netting opposite flows

If multiple pending swaps hit the same pair in opposite directions, do not algebraically net them unless they are truly in the same pool and same fee tier. Different pools on the same pair create different reserve paths and can open, not close, arbitrage.

## Prediction Cache Layout

Recommended Redis layout:

- `fr:pending:tx:{chainId}:{txHash}` → full normalized decoded tx, TTL 120s.
- `fr:pending:by-account:{chainId}:{from}:{nonce}` → tx hash pointer, TTL 120s.
- `fr:prediction:pool:{chainId}:{poolAddress}` → projected state summary, TTL 15s.
- `fr:predictions:{chainId}` → sorted set of affected pools scored by aggregate confidence.

Prediction keys need short TTLs because stale projections are actively harmful. A good failure mode is missing predictions, not lingering ones.

## Worker Loop and Backpressure

The mempool worker can be overwhelmed on busy chains. Implement bounded concurrency:

- fetch full tx details with concurrency cap (for example 50),
- decode with worker pool or micro-batching,
- drop low-value router traffic if queue backlog exceeds threshold,
- emit metrics: decode latency, pending queue size, prediction recalculation duration.

When backlog is severe, prefer processing transactions that touch pools already present in top discovered routes and pools above TVL threshold. This preserves trading relevance under load.

## Failure Modes

If websocket subscription drops and fallback polling begins, the system should mark `predictionQuality='degraded'` in health state and widen profit thresholds used by the executor. This prevents over-trusting partially observed mempool conditions.


## API and Observability Surfaces

The mempool subsystem should expose a read-only internal API or service methods for:

- current pending swap count by chain,
- top affected pools by projected price movement,
- decoder hit rate by router family,
- replacement/cancellation rate,
- prediction quality state (`healthy`, `degraded`).

These values are useful both for admin diagnostics and for adaptive executor thresholds.

## Additional Test Cases

16. Replacement tx with same nonce supersedes older projection and removes its pool impact.
17. Low-confidence decoded swap stays in cache but is excluded from high-confidence graph overlay.
18. Websocket disconnect triggers polling fallback and health status becomes degraded.

Prediction cache invalidation must be exact for replaced and confirmed transactions.
Prefer missing predictions over stale projections that bias execution.
Track pool-level prediction freshness timestamps.
Record decoder warnings for unsupported router branches.
Surface queue pressure metrics.
Annotate degraded modes clearly.
Persist confidence histograms.
Publish predictor stats.
Avoid stale overlays.
Always.
