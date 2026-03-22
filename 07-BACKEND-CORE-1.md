# Backend Core 1: Route Discovery & Pool State Engine

---

## Overview

This file specifies the core domain services that power FlashRoute's arbitrage discovery: pool state management, graph construction, and route discovery. These services form the Analytics Engine process — the brain of the system.

**Files created:** 6 files
**Estimated LOC:** 4,000-6,000

---

## Files

```
src/services/poolState.service.ts      # Pool state fetching, caching, and management
src/services/graphBuilder.service.ts   # DEX graph construction from pool states
src/services/routeDiscovery.service.ts # Arbitrage cycle detection (Bellman-Ford/SPFA)
src/services/tokenRegistry.service.ts  # Token metadata management
src/services/chainManager.service.ts   # Multi-chain configuration and switching
src/workers/analytics-engine.ts        # Worker entry point orchestrating the above
```

---

## PoolStateService (src/services/poolState.service.ts)

Manages real-time pool reserve data. Fetches from subgraphs and on-chain, caches in Redis, and emits update events.

### Method: syncAllPools(chainId: number): Promise<void>

**Purpose:** Full sync of all pool reserves for a chain. Called on startup and periodically (every 5 minutes) as a safety net.

**Steps:**
1. Fetch all active pools from database: `SELECT * FROM pools WHERE chain_id = $1 AND is_active = true`
2. Batch pools by DEX type (V2, V3, Curve, Balancer)
3. For Uniswap V2/SushiSwap pools:
   - Use multicall contract to batch `getReserves()` calls (up to 100 per multicall)
   - Parse results: reserve0, reserve1, blockTimestampLast
4. For Uniswap V3 pools:
   - Multicall `slot0()` (sqrtPriceX96, tick, liquidity) + `liquidity()`
   - Fetch tick bitmap for active range (±500 ticks from current)
5. For Curve pools:
   - Call `get_balances()` on each pool
   - Call `A()` for amplification coefficient
6. For Balancer pools:
   - Call Vault `getPoolTokens(poolId)` for balances
   - Call pool `getNormalizedWeights()` for weights
7. Write all results to Redis:
   - Key pattern: `fr:pool:{chainId}:{poolAddress}`
   - Value: JSON `{ reserve0, reserve1, sqrtPriceX96?, tick?, liquidity?, balances?, weights?, amplification?, blockNumber, updatedAt }`
   - TTL: 30 seconds (safety expiry; normally refreshed every block)
8. Publish `fr:pool:update` event for each changed pool
9. Log: `Synced {count} pools on chain {chainId} in {ms}ms`

**Error handling:**
- If multicall fails for a batch: retry once, then skip batch and log warning
- If subgraph is down: fall back to direct RPC calls (slower but functional)
- If pool returns zero reserves: mark as inactive in database, exclude from graph

---

### Method: updatePoolFromBlock(chainId: number, blockNumber: number, logs: Log[]): Promise<void>

**Purpose:** Incremental update from new block event logs. Much faster than full sync.

**Steps:**
1. Filter logs for Sync events (Uniswap V2: topic `0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1`)
2. Filter logs for Swap events (V2, V3, Curve, Balancer swap signatures)
3. For each affected pool:
   - Decode new reserves from event data
   - Update Redis cache
   - Publish `fr:pool:update` with new reserves and block number
4. Log: `Updated {count} pools from block {blockNumber}`

---

### Method: getPoolState(chainId: number, poolAddress: string): Promise<PoolState | null>

**Purpose:** Read current pool state from Redis cache.

**Steps:**
1. Redis GET `fr:pool:{chainId}:{poolAddress}`
2. If null or expired: return null (caller should handle stale data)
3. Parse JSON, return typed PoolState object

---

### Method: getPoolStatesForTokenPair(chainId: number, token0: string, token1: string): Promise<PoolState[]>

**Purpose:** Get all pool states for a specific token pair across all DEXes.

**Steps:**
1. Query database: `SELECT * FROM pools WHERE chain_id = $1 AND ((token0_id = $2 AND token1_id = $3) OR (token0_id = $3 AND token1_id = $2)) AND is_active = true`
2. For each pool, get state from Redis
3. Filter out pools with stale or missing state
4. Return array sorted by TVL descending

---

### Method: discoverNewPools(chainId: number): Promise<number>

**Purpose:** Find and register newly created pools. Called every 10 minutes.

**Steps:**
1. For each DEX factory contract on this chain:
   - Query recent PairCreated / PoolCreated events (last 100 blocks)
   - For each new pool address not already in database:
     - Fetch token addresses from pool contract
     - Look up or create token entries in tokens table
     - Check token blacklist
     - Fetch initial reserves
     - Insert pool into database
     - Add to Redis cache
2. Return count of new pools discovered
3. Log: `Discovered {count} new pools on chain {chainId}`

---

## GraphBuilderService (src/services/graphBuilder.service.ts)

Constructs and maintains the weighted directed graph used for arbitrage detection.

### Internal State

```typescript
// Graph representation using adjacency list with typed arrays for performance:
// vertices: Map<string, number>  // token address → vertex index
// edges: { from: number, to: number, weight: number, pool: string, dex: string }[]
// adjacency: number[][]  // adjacency[vertexIndex] = array of edge indices
```

### Method: buildGraph(chainId: number): Promise<GraphStats>

**Purpose:** Full graph construction from current pool states.

**Steps:**
1. Fetch all active pools for chain from database
2. Fetch all pool states from Redis
3. Initialize empty graph
4. For each pool with valid state:
   - Get token0 and token1 addresses
   - Create vertex for each token (if not exists)
   - Calculate marginal exchange rate for token0→token1: `rate = reserveOut * (1 - fee) / reserveIn`
   - Calculate weight: `weight = -Math.log(rate)`
   - Add directed edge token0→token1 with weight
   - Calculate reverse rate and add edge token1→token0
5. For Uniswap V3 pools: use sqrtPriceX96 to compute marginal rate (more accurate than reserve-based)
6. For Curve pools: compute rate using the StableSwap invariant derivative at current balance point
7. For Balancer pools: compute rate using weighted product formula
8. Store graph in memory (not Redis — too large and accessed too frequently)
9. Return stats: { totalTokens, totalPools, totalEdges, buildTimeMs }

---

### Method: updateEdgesForPool(chainId: number, poolAddress: string, newState: PoolState): void

**Purpose:** Incrementally update graph edges when a pool's state changes. Called on every `fr:pool:update` event.

**Steps:**
1. Find all edges involving this pool (typically 2: forward and reverse)
2. Recalculate exchange rates with new reserves
3. Update edge weights in-place
4. Mark graph as "dirty" (route discovery should re-run)

**Performance:** O(1) per pool update — just weight recalculation for 2 edges. No graph reconstruction.

---

### Method: getGraph(): Graph

Returns current in-memory graph reference. Used by RouteDiscoveryService.

### Method: getGraphStats(): GraphStats

Returns current graph statistics for the API.

---

## RouteDiscoveryService (src/services/routeDiscovery.service.ts)

Finds profitable arbitrage cycles in the graph using modified SPFA.

### Method: findArbitrageCycles(chainId: number, options: DiscoveryOptions): Promise<ArbitrageCycle[]>

**Input options:**
```typescript
{
  maxHops: number,           // 2-6, from strategy config
  maxCycles: number,         // max cycles to return (default 50)
  sourceTokens?: string[],   // tokens to start search from (default: WETH, USDC, USDT, DAI, WBTC)
  minProfitRatio: number,    // minimum cycle profit ratio (default 0.001 = 0.1%)
}
```

**Steps:**
1. Get current graph from GraphBuilderService
2. If graph is not dirty since last scan: return cached results (no new opportunities)
3. For each source token in sourceTokens (priority order):
   - Run SPFA with negative cycle detection (see Algorithm 2 in 04-ALGORITHMS.md)
   - Collect all cycles with totalWeight < -Math.log(1 + minProfitRatio)
   - Limit hops to maxHops per cycle
4. Deduplicate cycles: two cycles are the same if they contain the same set of pools in the same order (regardless of starting token rotation)
5. Sort by estimated profit ratio descending
6. Trim to maxCycles
7. Publish top cycles to Redis: `fr:route:discovered` channel
8. Store in Redis sorted set: `fr:opportunities:{chainId}` with score = -profitRatio (for descending sort)
9. Set TTL on sorted set members: 2 blocks (24 seconds on Ethereum)
10. Mark graph as "clean"
11. Return cycles

**Performance targets:**
- 500 tokens, 2000 edges, maxHops=4: <200ms
- 1000 tokens, 5000 edges, maxHops=4: <1 second

---

### Method: getActiveOpportunities(chainId: number, filters: OpportunityFilters): Promise<Opportunity[]>

**Purpose:** Read current opportunities from Redis for the API.

**Steps:**
1. Read from Redis sorted set `fr:opportunities:{chainId}`
2. Apply filters: minProfitUsd, maxHops
3. Return formatted opportunities with route details, estimated profit, confidence, expiry time

---

## TokenRegistryService (src/services/tokenRegistry.service.ts)

### Method: getToken(chainId: number, address: string): Promise<Token | null>

Fetch token from database cache. If not found, fetch on-chain (name, symbol, decimals) and create entry.

### Method: isBlacklisted(chainId: number, address: string): Promise<boolean>

Check blacklist status. Blacklisted tokens have transfer taxes, are honeypots, or are otherwise dangerous.

### Method: updateBlacklist(chainId: number, address: string, reason: string): Promise<void>

Add token to blacklist. Called when a token causes unexpected behavior during simulation.

### Method: getTokenPrice(chainId: number, address: string): Promise<number>

Get USD price estimate. Sources (in priority order):
1. CoinGecko API (for known tokens with coingecko_id)
2. Calculate from pool reserves (e.g., if WETH/USDC pool exists, derive ETH price)
3. Return 0 if no price source available

---

## ChainManagerService (src/services/chainManager.service.ts)

### Method: getActiveChains(): Promise<SupportedChain[]>

Return all chains where is_active=true from database + config.

### Method: getChainConfig(chainId: number): ChainConfig

Return chain-specific configuration (RPC URLs, flash loan providers, DEX configs, gas settings).

### Method: getProvider(chainId: number): ethers.Provider

Return the appropriate ethers provider for a chain. Manages provider lifecycle and health checks.

---

## Analytics Engine Worker (src/workers/analytics-engine.ts)

**Purpose:** Main orchestration process that ties together pool state, graph building, and route discovery.

### Startup Sequence

1. Initialize logger with service='analytics-engine'
2. Connect to Redis
3. Initialize ChainManager → get active chains
4. For each active chain:
   - Initialize provider
   - Run PoolStateService.syncAllPools() (full initial sync)
   - Run GraphBuilderService.buildGraph() (full initial build)
   - Subscribe to new block events
   - Subscribe to `fr:pool:update` events
   - Subscribe to `fr:demand:prediction` events
5. Log: "Analytics engine started. Monitoring {N} chains."

### Main Loop (Per Block)

```
ON NEW BLOCK (chainId, blockNumber):
  1. Fetch block with transaction receipts
  2. PoolStateService.updatePoolFromBlock(chainId, blockNumber, block.logs)
  3. GraphBuilderService processes pool update events (incremental edge updates)
  4. RouteDiscoveryService.findArbitrageCycles(chainId, activeStrategyOptions)
  5. For each profitable cycle:
     - Publish to fr:route:discovered
     - If demand predictions are available: overlay predicted states and re-evaluate
  6. Log cycle stats: { blockNumber, cyclesFound, bestProfitRatio, scanTimeMs }
```

### Periodic Tasks

| Task | Interval | Action |
|---|---|---|
| Full pool sync | 5 minutes | PoolStateService.syncAllPools() — catches any missed updates |
| New pool discovery | 10 minutes | PoolStateService.discoverNewPools() |
| Full graph rebuild | 15 minutes | GraphBuilderService.buildGraph() — full rebuild from fresh state |
| Stale pool cleanup | 1 hour | Mark pools with no volume in 7 days as inactive |
| Token blacklist check | 1 hour | Re-validate recently added tokens for transfer tax behavior |

---

## Test Cases (18 cases)

| # | Test | Input | Expected | Validates |
|---|---|---|---|---|
| 1 | Full pool sync | 50 mock V2 pools | All 50 cached in Redis | Pool syncing |
| 2 | Pool sync with multicall failure | Multicall reverts for batch 2 of 3 | Batches 1, 3 succeed; batch 2 logged as warning | Error resilience |
| 3 | Incremental pool update from Sync event | V2 Sync event log | Redis updated, pool:update published | Incremental update |
| 4 | Graph build from 10 pools | 10 V2 pools, 8 tokens | Graph with 8 vertices, 20 edges | Graph construction |
| 5 | Edge weight calculation V2 | ETH: 1000, USDC: 3000000, fee: 30bps | weight = -ln(2997/1000) ≈ -1.097 | V2 weight math |
| 6 | Incremental graph update | One pool reserve changes | Only 2 edges updated, rest unchanged | Incremental efficiency |
| 7 | SPFA finds triangle arb | A→B: 1.01, B→C: 1.01, C→A: 1.01 | Cycle found with ~3% profit | Triangle detection |
| 8 | SPFA respects maxHops | 5-hop cycle exists, maxHops=4 | Cycle not found | Hop limit |
| 9 | SPFA with no arbitrage | All rates exactly 1.0 | Empty result | No-opportunity handling |
| 10 | Cycle deduplication | A→B→C→A and B→C→A→B discovered | Reported as one cycle | Dedup logic |
| 11 | Opportunity expiry | Cycle published, 30 seconds pass | Removed from Redis sorted set | TTL enforcement |
| 12 | Token blacklist filtering | Blacklisted token in potential route | Route excluded from results | Blacklist enforcement |
| 13 | New pool discovery | Factory emits PairCreated | New pool added to DB and Redis | Pool discovery |
| 14 | Multi-DEX graph | 5 V2, 5 V3, 2 Curve pools, same tokens | All pools in graph, multiple edges per pair | Multi-DEX support |
| 15 | V3 price from sqrtPriceX96 | sqrtPriceX96 = 79228162514264337593543950336 | Price = 1.0 (1:1) | V3 math |
| 16 | Curve rate calculation | 3-pool balanced, A=2000 | Near 1:1 rate for stablecoins | Curve math |
| 17 | Analytics engine startup | All services healthy | Syncs pools, builds graph, starts block subscription | Integration |
| 18 | Block processing end-to-end | Mock block with 3 Sync events | Pool states updated → graph updated → routes scanned | Full pipeline |


---

## Graph Construction Rules and Numerical Stability

The graph builder is the first place shallow implementations break. A naïve graph that stores only spot price per pool will overstate profit, miss fee effects, and produce a flood of unexecutable cycles. The graph must encode **trade-size-aware approximate rates** and enough metadata to allow fast refinement in the simulator.

### Edge payload requirements

Each directed edge should include:

- `poolAddress`, `dexType`, `chainId`,
- `tokenIn`, `tokenOut`,
- `feeBps`,
- `reserveSnapshotBlock`,
- `spotRate`,
- `sampleAmountIn`,
- `sampleAmountOut`,
- `weight = -ln(sampleAmountOut / sampleAmountIn)`,
- `estimatedSlippageBps`,
- `gasOverheadEstimate`,
- `tvlUsd`,
- `disabledReason?`.

Use a configurable probe size per token class, not one universal amount. Example: 0.5 ETH, 5,000 USDC, 5,000 USDT, 2 WBTC. The point is to approximate executable routing rather than infinitesimal spot price.

### Pool inclusion thresholds

Exclude a pool from the graph if any of the following are true:

- reserve age exceeds `maxPoolStateAgeMs`,
- TVL below configured minimum for its chain,
- token marked as blacklisted or transfer-tax suspected,
- pool paused at contract level,
- observed on-chain swap reverted in the last N attempts due to non-standard token behavior,
- V3 liquidity near current tick is effectively zero for the configured probe size.

This exclusion logic belongs in `GraphBuilderService`, not just data ingestion, because a pool may remain registered in the database but be temporarily unsuitable for routing.

## Route Discovery Algorithm Details

The file already calls for Bellman-Ford/SPFA. Implementation should use a hybrid approach:

1. build adjacency list by token,
2. restrict start vertices to high-liquidity base assets (WETH, USDC, USDT, DAI, WBTC, chain-native wrappers),
3. run bounded-hop SPFA from each start token,
4. when a negative cycle candidate is found, reconstruct the predecessor chain,
5. canonicalize cycle ordering to deduplicate rotations,
6. pass the cycle through a quick executable filter before publishing.

### Quick executable filter

Before a cycle reaches the expensive simulator, check:

- all pools updated within the same recent freshness window,
- no repeated pool in the cycle unless explicitly allowed,
- route starts and ends in same source asset,
- product of sampled rates exceeds `1 + minGrossEdgeProfitPct`,
- estimated gross USD profit exceeds minimum gas floor by at least 2x.

This filter drastically reduces simulator load.

### Deduplication key

A cycle like `WETH→USDC→DAI→WETH` is equivalent to any rotation of that sequence. Compute a canonical signature from the lexicographically smallest rotation of `(token, pool)` tuples plus chain id. Store recent signatures in Redis with 6-second TTL so the same route is not re-published every block unless profitability materially changes.

## Pool State Consistency and Reconciliation

`updatePoolFromBlock()` must treat block processing as atomic per chain. If a block contains multiple logs affecting the same pool, only the final state after all logs in transaction/log order should be published. Do not emit intermediate states from earlier logs in the same block because downstream graph updates would compute against impossible transient states.

Recommended algorithm:

1. group logs by pool address,
2. sort by transaction index then log index,
3. replay updates into a mutable per-pool state object,
4. after full replay, write a single Redis state snapshot per pool,
5. publish one `fr:pool:update` event per affected pool.

If block processing fails halfway, mark chain reconciliation as dirty and schedule a `syncAffectedPools(chainId, poolAddresses)` repair task. Silent partial application is unacceptable because route discovery would operate on inconsistent state.

## Token Registry and Non-Standard Asset Handling

The token registry is more than symbol/decimals lookup. It must classify assets by execution risk.

Suggested token flags:

- `isStablecoin`,
- `isWrappedNative`,
- `isBlacklisted`,
- `hasTransferFee`,
- `hasRebasingBehavior`,
- `permitSupported`,
- `priceOracleSource`,
- `riskTier` (`safe`, `review`, `blocked`).

Discovery of new pools should not auto-enable execution for unknown tokens. Newly seen tokens enter `review` tier until they pass heuristics:

1. decimals call succeeds,
2. symbol/name calls do not revert or return garbage beyond limits,
3. a tiny transfer simulation does not indicate transfer tax,
4. at least one reliable USD price source exists or token pairs with a trusted bridge asset,
5. no known blacklist match in `system_token_blacklist`.

## ChainManager Responsibilities

`ChainManagerService` should expose a runtime registry of chain-specific settings used throughout the backend:

- RPC URLs and fallback priority,
- websocket URL,
- multicall contract address,
- wrapped native token address,
- supported DEX adapters,
- flash loan providers,
- min TVL and min profit thresholds,
- block time estimate,
- finality lag for analytics,
- whether private relay submission is supported.

When config changes at runtime, ChainManager should hot-reload affected values and emit an internal event. Workers should subscribe and adapt without full restart unless a websocket endpoint changed.
