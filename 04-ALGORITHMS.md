# Algorithms: FlashRoute

---

## Overview

FlashRoute's core intelligence is built on four algorithms that work as a pipeline:

1. **AMM Price Calculator** — Computes exact swap outputs for each DEX type (Uniswap V2, V3, Curve, Balancer)
2. **Graph-Based Arbitrage Route Discovery** — Finds profitable cycles using modified Bellman-Ford with log-transformed edge weights
3. **Mempool Transaction Impact Predictor** — Decodes pending transactions and simulates their effect on pool states
4. **Profit Simulation & Optimal Amount Search** — Binary searches for the trade amount that maximizes net profit across the full route

These algorithms execute in sequence every time a new block arrives or a significant mempool event occurs. Total cycle time target: <500ms on L2, <2 seconds on Ethereum mainnet.

---

## Algorithm 1: AMM Price Calculator

### Purpose
Given an input token, output token, pool address, and trade amount, compute the exact output amount after fees and slippage. This is the fundamental building block — every edge weight in the arbitrage graph depends on accurate price calculation.

### Mathematical Foundations

#### Uniswap V2 / SushiSwap (Constant Product: x * y = k)

**Formula for exact output given input amount:**
```
amountOut = (reserveOut * amountIn * (10000 - feeBps)) / (reserveIn * 10000 + amountIn * (10000 - feeBps))
```

Where:
- `reserveIn` = reserve of the input token in the pool
- `reserveOut` = reserve of the output token in the pool
- `amountIn` = amount of input token being swapped
- `feeBps` = pool fee in basis points (typically 30 for 0.3%)

**Derivation:** Starting from constant product invariant x * y = k:
```
(reserveIn + amountIn * (1 - fee)) * (reserveOut - amountOut) = reserveIn * reserveOut
reserveOut - amountOut = (reserveIn * reserveOut) / (reserveIn + amountIn * (1 - fee))
amountOut = reserveOut - (reserveIn * reserveOut) / (reserveIn + amountIn * (1 - fee))
amountOut = reserveOut * amountIn * (1 - fee) / (reserveIn + amountIn * (1 - fee))
```

**Price impact (slippage) for amount Δx:**
```
priceImpact = amountIn / (reserveIn + amountIn * (1 - fee))
```

As amountIn → 0, priceImpact → 0 (marginal rate).
As amountIn → reserveIn, priceImpact → ~50% (catastrophic slippage).

#### Uniswap V3 (Concentrated Liquidity)

V3 introduces tick-based liquidity concentration. The price space is divided into discrete ticks, and liquidity is active only within specific ranges.

**Key concepts:**
- `sqrtPriceX96` = sqrt(price) * 2^96 (fixed-point representation used by the contract)
- `liquidity` (L) = the active liquidity at the current tick
- `tickSpacing` = minimum tick distance for the pool's fee tier (1 for 0.01%, 10 for 0.05%, 60 for 0.3%, 200 for 1%)

**Swap within a single tick range:**
```
When swapping token0 → token1:
  amountOut = L * (1/sqrtPrice_lower - 1/sqrtPrice_upper)
  
  More precisely:
  sqrtPrice_next = (L * sqrtPrice_current) / (L + amountIn * sqrtPrice_current)
  amountOut = L * (sqrtPrice_current - sqrtPrice_next)
```

**Cross-tick swap (large amounts):**
When the swap amount is large enough to exhaust liquidity at the current tick:
1. Calculate how much input is needed to move price to the next tick boundary
2. Compute output for that partial amount
3. Update liquidity (L changes at tick boundaries based on position entries/exits)
4. Repeat with remaining input at the new tick with new liquidity
5. Sum all partial outputs, subtract fee from each partial

**Pseudocode:**
```
ALGORITHM UniswapV3Swap(amountIn, sqrtPriceCurrent, liquidity, ticks[], feeBps):
  
  remainingInput = amountIn
  totalOutput = 0
  currentSqrtPrice = sqrtPriceCurrent
  currentLiquidity = liquidity
  currentTickIndex = getCurrentTick(sqrtPriceCurrent)
  
  WHILE remainingInput > 0:
    nextTick = getNextInitializedTick(currentTickIndex, direction)
    sqrtPriceTarget = tickToSqrtPrice(nextTick)
    
    // Calculate max input to reach next tick
    maxInputForTick = getInputToPrice(currentLiquidity, currentSqrtPrice, sqrtPriceTarget)
    
    IF remainingInput <= maxInputForTick:
      // Swap completes within this tick range
      inputAfterFee = remainingInput * (10000 - feeBps) / 10000
      sqrtPriceNext = computeNextPrice(currentLiquidity, currentSqrtPrice, inputAfterFee)
      output = computeOutput(currentLiquidity, currentSqrtPrice, sqrtPriceNext)
      totalOutput += output
      remainingInput = 0
    ELSE:
      // Exhaust this tick range, move to next
      inputForThisTick = maxInputForTick
      inputAfterFee = inputForThisTick * (10000 - feeBps) / 10000
      output = computeOutput(currentLiquidity, currentSqrtPrice, sqrtPriceTarget)
      totalOutput += output
      remainingInput -= inputForThisTick
      currentSqrtPrice = sqrtPriceTarget
      currentLiquidity += ticks[nextTick].liquidityNet // Cross tick: add/remove liquidity
      currentTickIndex = nextTick
  
  RETURN totalOutput

END ALGORITHM
```

#### Curve Finance (StableSwap Invariant)

Curve uses a hybrid invariant between constant-sum (x + y = D) and constant-product (xy = k), controlled by the amplification parameter A:

**Invariant:**
```
A * n^n * Σ(x_i) + D = A * D * n^n + D^(n+1) / (n^n * Π(x_i))
```

Where:
- A = amplification coefficient (typically 100-2000 for stablecoin pools)
- n = number of tokens in pool (2, 3, or 4)
- D = invariant value (total value of pool when balanced)
- x_i = balance of token i

**Computing swap output:**
Given input amount dx to token i, find output amount dy from token j:
1. Compute new balance of token i: x_i_new = x_i + dx
2. Solve the invariant equation for x_j_new (the new balance of token j)
3. Output = x_j - x_j_new - fee

**Solving for x_j (Newton's method):**
```
ALGORITHM CurveGetY(i, j, x_new_i, balances[], A, D):
  
  // Compute c and S (constants for Newton iteration)
  S = 0
  c = D
  n = balances.length
  Ann = A * n^n
  
  FOR k IN 0..n-1:
    IF k == j: CONTINUE
    xk = (k == i) ? x_new_i : balances[k]
    S += xk
    c = c * D / (xk * n)
  
  c = c * D / (Ann * n)
  b = S + D / Ann
  
  // Newton iteration to find y
  y = D
  FOR iteration IN 0..255:
    y_prev = y
    y = (y * y + c) / (2 * y + b - D)
    IF abs(y - y_prev) <= 1:
      RETURN y
  
  THROW ConvergenceError
  
END ALGORITHM
```

**Fee calculation:** Curve charges fees on the "ideal" balanced swap amount:
```
fee = feeBps * (ideal_balance - new_balance) / ideal_balance
```

#### Balancer (Weighted Constant Product)

Balancer pools support 2-8 tokens with custom weights (e.g., 80% ETH / 20% USDC).

**Swap formula (exact input):**
```
amountOut = balanceOut * (1 - (balanceIn / (balanceIn + amountIn * (1 - swapFee)))^(weightIn / weightOut))
```

Where:
- `balanceIn`, `balanceOut` = token balances in the pool
- `weightIn`, `weightOut` = token weights (sum to 1.0)
- `swapFee` = pool swap fee (typically 0.1% - 3%)

The exponent `weightIn/weightOut` handles asymmetric pools. For a 50/50 pool, this reduces to the standard constant product formula.

### Configuration Parameters

| Parameter | Type | Default | Valid Range | Effect |
|---|---|---|---|---|
| maxTickTraversal | integer | 100 | 1-500 | Max ticks to cross in V3 swap simulation (prevents infinite loop on extreme swaps) |
| curveNewtonIterations | integer | 255 | 50-500 | Max Newton iterations for Curve invariant solving |
| curveConvergenceTolerance | bigint | 1 | 0-10 | Wei-level tolerance for Curve convergence |
| minOutputThreshold | bigint | 0 | 0-∞ | Minimum output to consider swap valid (filters dust amounts) |

### Test Cases (12 cases)

| # | DEX | Input | Reserves/State | Expected Output | Validates |
|---|---|---|---|---|---|
| 1 | Uniswap V2 | 1 ETH | ETH: 1000, USDC: 3000000 (18/6 dec) | ~2991.03 USDC | Basic constant product with 0.3% fee |
| 2 | Uniswap V2 | 100 ETH | ETH: 1000, USDC: 3000000 | ~272727 USDC | High slippage scenario (~9% impact) |
| 3 | Uniswap V2 | 0.001 ETH | ETH: 1000, USDC: 3000000 | ~2.999 USDC | Tiny amount (near-zero slippage) |
| 4 | Uniswap V3 | 1 ETH | Single tick, L=1e18, sqrtPrice=1.732e18 | Computed from tick math | Single-tick V3 swap |
| 5 | Uniswap V3 | 50 ETH | Multi-tick, varying liquidity | Sum of per-tick outputs | Cross-tick V3 swap |
| 6 | Uniswap V3 | 1 ETH | Empty tick range ahead | Partial fill + remaining | Liquidity gap handling |
| 7 | Curve | 1000 USDC | 3-pool (USDC/USDT/DAI), A=2000, balanced 1M each | ~999.7 DAI | Stableswap near peg |
| 8 | Curve | 100000 USDC | 3-pool, A=2000, imbalanced (2M/500K/500K) | Less than 100K DAI | Imbalanced pool higher slippage |
| 9 | Curve | 1 USDC | 3-pool, A=2000 | ~0.9997 DAI | Minimal amount |
| 10 | Balancer | 1 ETH | 80/20 ETH/USDC, 1000 ETH / 750000 USDC, 0.3% fee | ~747.75 USDC | Weighted pool swap |
| 11 | Balancer | 1 ETH | 50/50 ETH/USDC, 1000/3000000, 0.3% fee | ~2991 USDC | Equal-weight (should match V2) |
| 12 | Any | 0 | Any | 0 | Zero input returns zero |

### Performance Analysis

| DEX Type | Time Complexity | Space Complexity | Notes |
|---|---|---|---|
| Uniswap V2 | O(1) | O(1) | Single formula evaluation |
| Uniswap V3 | O(T) where T = ticks crossed | O(T) for tick data | Typically T < 10 for moderate swaps |
| Curve | O(I) where I = Newton iterations | O(n) for balances | Usually converges in 5-20 iterations |
| Balancer | O(1) | O(1) | Single formula with exponentiation |

---

## Algorithm 2: Graph-Based Arbitrage Route Discovery

### Purpose
Discover all profitable arbitrage cycles across all monitored DEX pools. A profitable cycle is a sequence of swaps starting and ending at the same token where the output exceeds the input.

### Mathematical Foundation

**Graph construction:**
- Vertices V = set of all tokens with active pools
- Edges E = set of directed edges, one per (tokenIn, tokenOut, pool) tuple
- Each pool creates TWO directed edges (token0→token1 and token1→token0)
- Edge weight: `w(i,j,pool) = -ln(effective_rate(i,j,pool))`

**Why logarithmic transformation:**
A profitable cycle satisfies: `Π(rate_k) > 1` for all hops k in the cycle.
Taking ln: `Σ(ln(rate_k)) > 0`
Negating: `Σ(-ln(rate_k)) < 0`

This converts the multiplicative profit condition into an additive negative-weight cycle detection problem, solvable by Bellman-Ford.

**Edge weight computation:**
For a marginal (infinitesimally small) trade:
```
marginal_rate(i, j, pool) = reserveOut * (1 - fee) / reserveIn  [for Uniswap V2]
weight(i, j, pool) = -ln(marginal_rate(i, j, pool))
```

For amount-dependent analysis (accounts for slippage at specific trade sizes):
```
effective_rate(i, j, pool, amount) = amountOut(amount) / amount
weight(i, j, pool, amount) = -ln(effective_rate(i, j, pool, amount))
```

### Pseudocode: Modified SPFA (Shortest Path Faster Algorithm)

SPFA is a queue-based optimization of Bellman-Ford that is typically 5-10x faster in practice. We modify it to:
1. Detect ALL negative cycles (not just from one source)
2. Track cycle paths for route extraction
3. Limit maximum cycle length (hops) to prevent gas-expensive routes

```
ALGORITHM FindArbitrageCycles(graph, maxHops):
  
  INPUT:
    graph: { vertices: Token[], edges: Edge[] }
    maxHops: integer (2-6, typically 4)
  
  OUTPUT:
    cycles: ArbitrageCycle[] — sorted by estimated profit descending
  
  // Initialize
  dist = Map<Token, number>  // shortest distance from source
  pred = Map<Token, Edge>    // predecessor edge for path reconstruction
  inQueue = Set<Token>       // tokens currently in queue
  relaxCount = Map<Token, integer>  // number of times each vertex was relaxed
  cycles = []
  
  // Run from each token as potential cycle start
  FOR EACH sourceToken IN graph.vertices:
    
    // Reset for this source
    dist.clear()
    pred.clear()
    inQueue.clear()
    relaxCount.clear()
    
    dist[sourceToken] = 0
    queue = Deque([sourceToken])
    inQueue.add(sourceToken)
    
    WHILE queue IS NOT EMPTY:
      u = queue.popFront()
      inQueue.remove(u)
      
      FOR EACH edge (u → v, weight w) IN graph.outEdges(u):
        newDist = dist[u] + w
        
        IF newDist < dist.getOrDefault(v, 0):
          // Negative cycle detection: if v == sourceToken AND we've taken ≥ 2 hops
          IF v == sourceToken AND countHops(pred, u, sourceToken) >= 1:
            cycle = reconstructCycle(pred, u, sourceToken, edge)
            IF cycle.hops <= maxHops:
              cycles.push(cycle)
            CONTINUE
          
          // Check hop limit
          IF countHops(pred, u, sourceToken) >= maxHops - 1:
            CONTINUE
          
          dist[v] = newDist
          pred[v] = edge
          relaxCount[v] = relaxCount.getOrDefault(v, 0) + 1
          
          // Early termination: too many relaxations indicates complex cycles
          IF relaxCount[v] > graph.vertices.length:
            CONTINUE
          
          IF v NOT IN inQueue:
            // SLF optimization: if newDist < dist of front, push to front
            IF queue.length > 0 AND newDist < dist[queue.peekFront()]:
              queue.pushFront(v)
            ELSE:
              queue.pushBack(v)
            inQueue.add(v)
  
  // Sort by estimated profit (most negative total weight = most profitable)
  cycles.sort(BY cycle.totalWeight ASC)
  
  // Remove duplicate cycles (same pools in different rotations)
  cycles = deduplicateCycles(cycles)
  
  RETURN cycles

END ALGORITHM
```

```
ALGORITHM reconstructCycle(pred, lastNode, sourceToken, finalEdge):
  
  path = [finalEdge]  // the edge back to sourceToken
  current = lastNode
  
  WHILE current != sourceToken:
    edge = pred[current]
    path.unshift(edge)
    current = edge.from
  
  estimatedProfit = exp(-sum(edge.weight for edge in path)) - 1.0  // as a ratio
  
  RETURN {
    sourceToken: sourceToken,
    path: path,  // array of { pool, tokenIn, tokenOut, dex, weight }
    hops: path.length,
    totalWeight: sum(edge.weight for edge in path),
    estimatedProfitRatio: estimatedProfit,
    discoveredAt: Date.now()
  }

END ALGORITHM
```

### Optimizations

**1. Pruning low-liquidity pools:**
Before graph construction, filter out pools where TVL < $10,000. These pools have high slippage even for small trades and rarely produce profitable routes.

**2. Token prioritization:**
Start SPFA from high-volume tokens first (WETH, USDC, USDT, DAI, WBTC). Most profitable cycles involve these hub tokens.

**3. Incremental graph updates:**
When a pool's reserves change (new block), only re-weight edges involving that pool instead of rebuilding the entire graph. Then re-run route discovery only from tokens connected to changed pools.

**4. Parallel cycle search:**
Run SPFA from multiple source tokens simultaneously using a shared cycle collection. Use a worker pool of 4-8 parallel searches.

### Configuration Parameters

| Parameter | Type | Default | Range | Effect |
|---|---|---|---|---|
| maxHops | integer | 4 | 2-6 | More hops = more opportunities but higher gas cost |
| minPoolTvlUsd | number | 10000 | 1000-1000000 | Lower = more pools in graph but more noise |
| maxCyclesPerScan | integer | 50 | 10-500 | Cap on cycles returned per scan (performance bound) |
| sourceTokenPriority | string[] | [WETH,USDC,USDT,DAI,WBTC] | — | Tokens to start search from first |
| graphUpdateMode | string | 'incremental' | incremental/full | Full rebuild vs. incremental updates |

### Test Cases (10 cases)

| # | Graph | Expected Result | Validates |
|---|---|---|---|
| 1 | Triangle: A→B→C→A, all rates 1.01 (1% profit per hop) | Cycle found, profit ~3.03% | Basic triangle detection |
| 2 | Same triangle, rates exactly 1.0 | No cycle found (no profit) | Break-even filtered |
| 3 | 4-hop cycle with one unprofitable hop | Cycle found if overall profit > 0 | Multi-hop with mixed hops |
| 4 | 5-hop profitable, maxHops=4 | Not found (exceeds maxHops) | Hop limit enforcement |
| 5 | Two overlapping cycles, different profits | Both found, sorted by profit | Multi-cycle ranking |
| 6 | Single pair (2-hop: A→B→A) | Found if rate(A→B) * rate(B→A) > 1 | Minimal cycle |
| 7 | Graph with 500 tokens, 2000 edges, 5 planted cycles | All 5 found in <500ms | Performance benchmark |
| 8 | Empty graph | Empty result | Edge case: no pools |
| 9 | Graph with only self-referencing edges | No cycles (self-loops filtered) | Self-loop filtering |
| 10 | Duplicate cycles (A→B→C→A and B→C→A→B) | Deduplicated to one cycle | Cycle deduplication |

### Performance Analysis

| Dimension | Complexity | Notes |
|---|---|---|
| Time | O(V² * E) worst case, O(V * E) average with SPFA | V=500, E=2000 → ~500ms worst case |
| Space | O(V + E) for graph, O(V) for SPFA state per source | ~10MB for 500 tokens, 2000 pools |
| Primary bottleneck | Edge relaxation loop | Hot path — use typed arrays, avoid GC |

---

## Algorithm 3: Mempool Transaction Impact Predictor

### Purpose
Monitor pending transactions in the Ethereum mempool, decode DEX swap transactions, and predict how they will change pool reserves if included in the next block. This gives FlashRoute a 1-block lookahead advantage.

### Data Flow

```
Mempool Stream → Transaction Decoder → Impact Calculator → Pool State Projector → Route Discovery
```

### Pseudocode

```
ALGORITHM ProcessPendingTransaction(tx):
  
  INPUT: tx = { hash, to, data, value, gasPrice, from }
  OUTPUT: PendingSwapImpact | null
  
  // Step 1: Identify if this is a DEX swap
  functionSelector = tx.data.slice(0, 10)  // first 4 bytes as hex
  
  swapInfo = matchSwapSelector(functionSelector, tx.to)
  IF swapInfo IS NULL:
    RETURN null  // Not a DEX transaction
  
  // Step 2: Decode swap parameters
  decodedParams = decodeSwapCalldata(swapInfo.dexType, swapInfo.routerVersion, tx.data)
  
  // Step 3: Calculate pool impact
  FOR EACH hop IN decodedParams.path:
    pool = findPool(hop.tokenIn, hop.tokenOut, swapInfo.dex)
    IF pool IS NULL: CONTINUE
    
    currentReserves = getPoolReserves(pool)  // from Redis cache
    simulatedOutput = calculateSwapOutput(
      swapInfo.dexType,
      decodedParams.amountIn,  // for first hop; use previous output for subsequent hops
      currentReserves
    )
    
    newReserveIn = currentReserves.reserveIn + decodedParams.amountIn
    newReserveOut = currentReserves.reserveOut - simulatedOutput
    
    impact = {
      poolAddress: pool.address,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      amountIn: decodedParams.amountIn,
      simulatedOutput: simulatedOutput,
      reserveBefore: currentReserves,
      reserveAfter: { reserveIn: newReserveIn, reserveOut: newReserveOut },
      priceImpactPct: (simulatedOutput / currentReserves.reserveOut) * 100,
      confidence: calculateConfidence(tx),
      txHash: tx.hash,
      senderAddress: tx.from
    }
    
    publishImpact(impact)  // Redis pub/sub → demand prediction channel
  
  RETURN impact

END ALGORITHM
```

```
ALGORITHM matchSwapSelector(selector, contractAddress):
  
  KNOWN_SELECTORS = {
    '0x38ed1739': { dex: 'uniswap_v2', method: 'swapExactTokensForTokens' },
    '0x8803dbee': { dex: 'uniswap_v2', method: 'swapTokensForExactTokens' },
    '0x7ff36ab5': { dex: 'uniswap_v2', method: 'swapExactETHForTokens' },
    '0x18cbafe5': { dex: 'uniswap_v2', method: 'swapExactTokensForETH' },
    '0x5ae401dc': { dex: 'uniswap_v3', method: 'multicall' },
    '0x3593564c': { dex: 'universal_router', method: 'execute' },
    '0xa6417ed6': { dex: 'curve', method: 'exchange' },
    '0x52bbbe29': { dex: 'balancer', method: 'swap' },
    '0xd9627aa4': { dex: '0x', method: 'sellToUniswap' },
    '0xe449022e': { dex: '1inch', method: 'uniswapV3Swap' }
  }
  
  IF selector IN KNOWN_SELECTORS:
    RETURN KNOWN_SELECTORS[selector]
  
  // Also check if contractAddress is a known router
  IF contractAddress IN KNOWN_ROUTERS:
    RETURN { dex: KNOWN_ROUTERS[contractAddress], method: 'unknown' }
  
  RETURN null

END ALGORITHM
```

```
ALGORITHM calculateConfidence(tx):
  
  // Higher gas price = higher confidence of inclusion in next block
  baseFee = getCurrentBaseFee()
  maxFee = tx.maxFeePerGas || tx.gasPrice
  priorityFee = tx.maxPriorityFeePerGas || (tx.gasPrice - baseFee)
  
  // Confidence factors
  gasFactor = min(1.0, priorityFee / (baseFee * 0.1))  // Higher tip = more likely inclusion
  ageFactor = min(1.0, timeSinceFirstSeen(tx.hash) / 12000)  // Older = more likely (been waiting)
  sizeFactor = min(1.0, tx.gas / 500000)  // Smaller txs more likely to fit in block
  
  confidence = gasFactor * 0.5 + ageFactor * 0.3 + sizeFactor * 0.2
  
  RETURN clamp(confidence, 0.0, 1.0)

END ALGORITHM
```

### Handling Complex Transactions

**Uniswap V3 multicall:** The V3 router uses multicall to batch multiple operations. Decode the multicall payload to extract individual swap calls within it.

**Universal Router execute:** Uses a command-based encoding. Decode the commands byte array to identify SWAP operations.

**Aggregator transactions (1inch, 0x):** These encode complex multi-hop routes. Decode to the best extent possible; mark confidence as lower for complex routes that can't be fully decoded.

### Configuration Parameters

| Parameter | Type | Default | Range | Effect |
|---|---|---|---|---|
| pendingTxBufferSize | integer | 10000 | 1000-50000 | Max pending txs tracked simultaneously |
| minImpactPct | number | 0.1 | 0.01-5.0 | Minimum pool impact to report (filters noise) |
| confidenceThreshold | number | 0.3 | 0.0-1.0 | Minimum confidence to include in predictions |
| txDecodeTimeoutMs | integer | 50 | 10-500 | Max time to spend decoding one transaction |
| maxPendingAge | integer | 60000 | 10000-120000 | Evict pending txs older than this (ms) |

### Test Cases (8 cases)

| # | Input | Expected | Validates |
|---|---|---|---|
| 1 | Standard V2 swapExactTokensForTokens | Decoded correctly with path, amounts | V2 decoding |
| 2 | V3 multicall with single exactInputSingle | Decoded single swap | V3 multicall decoding |
| 3 | V3 multicall with multi-hop exactInput | Decoded multi-hop path | Complex V3 decoding |
| 4 | Non-DEX transaction (ERC20 transfer) | Returns null | Non-swap filtering |
| 5 | Unknown contract address, known selector | Returns decoded with lower confidence | Fallback matching |
| 6 | Transaction with very high gas price (10x base) | Confidence near 1.0 | Confidence calculation |
| 7 | Transaction with gas price below base fee | Confidence near 0.0 | Low-priority filtering |
| 8 | Buffer at capacity (10000 txs), new tx arrives | Oldest tx evicted, new one added | LRU eviction |

---

## Algorithm 4: Profit Simulation & Optimal Amount Search

### Purpose
Given a candidate arbitrage cycle (from Algorithm 2), determine the exact flash loan amount that maximizes net profit after gas, fees, and slippage. Then decide whether to execute.

### Mathematical Foundation

**Net profit as a function of trade amount x:**
```
netProfit(x) = output(x) - x - flashLoanFee(x) - gasCost

Where:
  output(x) = result of executing the full swap cycle with input amount x
  flashLoanFee(x) = x * feeRate (0% for Balancer/dYdX, 0.05% for Aave)
  gasCost = gasUsed * gasPrice (estimated, in token terms)
```

**The output function output(x) is concave** — as x increases, slippage increases at each hop, and the marginal return decreases. This means netProfit(x) has a single maximum (or is always negative if the route isn't profitable).

**Finding optimal x via ternary search:**
Since netProfit(x) is unimodal (rises then falls), we can use ternary search on the interval [minAmount, maxAmount]:

```
ALGORITHM FindOptimalAmount(cycle, minAmount, maxAmount, tolerance):
  
  lo = minAmount  // e.g., $100
  hi = maxAmount  // e.g., $1,000,000 or strategy.maxTradeSizeUsd
  
  WHILE (hi - lo) > tolerance:
    m1 = lo + (hi - lo) / 3
    m2 = hi - (hi - lo) / 3
    
    profit1 = simulateFullCycle(cycle, m1)
    profit2 = simulateFullCycle(cycle, m2)
    
    IF profit1 < profit2:
      lo = m1
    ELSE:
      hi = m2
  
  optimalAmount = (lo + hi) / 2
  optimalProfit = simulateFullCycle(cycle, optimalAmount)
  
  RETURN { optimalAmount, optimalProfit }

END ALGORITHM
```

**Convergence:** Ternary search converges in O(log((maxAmount - minAmount) / tolerance)) iterations. For $100 to $1,000,000 with $0.01 tolerance: ~47 iterations. Each iteration calls simulateFullCycle once.

### Full Cycle Simulation

```
ALGORITHM simulateFullCycle(cycle, flashLoanAmount):
  
  INPUT:
    cycle: { sourceToken, path: [{pool, tokenIn, tokenOut, dex}] }
    flashLoanAmount: BigNumber (in source token units)
  
  OUTPUT:
    SimulationResult { netProfitUsd, gasEstimate, profitable, details }
  
  // Step 1: Select flash loan provider
  provider = selectCheapestProvider(cycle.sourceToken, flashLoanAmount)
  flashLoanFee = flashLoanAmount * provider.feeRate
  
  // Step 2: Simulate each hop sequentially
  currentAmount = flashLoanAmount
  hopResults = []
  
  FOR EACH hop IN cycle.path:
    poolState = getPoolState(hop.pool)  // from Redis, possibly with demand prediction overlay
    
    amountOut = calculateSwapOutput(
      hop.dex,
      currentAmount,
      poolState
    )
    
    hopResults.push({
      pool: hop.pool,
      amountIn: currentAmount,
      amountOut: amountOut,
      slippagePct: (1 - amountOut / (currentAmount * marginalRate(poolState))) * 100
    })
    
    // CRITICAL: Update pool state in simulation for subsequent hops
    // If the same pool appears twice in the cycle, the second hop sees updated reserves
    updateSimulatedPoolState(hop.pool, currentAmount, amountOut, hop.direction)
    
    currentAmount = amountOut
  
  // Step 3: Calculate profit
  grossProfit = currentAmount - flashLoanAmount  // in source token
  grossProfitUsd = toUsd(grossProfit, cycle.sourceToken)
  
  // Step 4: Estimate gas
  gasEstimate = estimateGas(cycle.path.length, provider.type)
  gasCostUsd = gasEstimate * getCurrentGasPrice() * ethPriceUsd
  
  // Step 5: Net profit
  flashLoanFeeUsd = toUsd(flashLoanFee, cycle.sourceToken)
  netProfitUsd = grossProfitUsd - gasCostUsd - flashLoanFeeUsd
  
  // Step 6: Apply risk buffer
  riskBuffer = calculateRiskBuffer(flashLoanAmount, cycle.path.length)
  
  RETURN {
    netProfitUsd: netProfitUsd,
    profitable: netProfitUsd > riskBuffer,
    grossProfitUsd: grossProfitUsd,
    gasCostUsd: gasCostUsd,
    flashLoanFeeUsd: flashLoanFeeUsd,
    riskBufferUsd: riskBuffer,
    gasEstimate: gasEstimate,
    provider: provider,
    hopResults: hopResults,
    optimalAmount: flashLoanAmount
  }

END ALGORITHM
```

### Gas Estimation

| Operation | Estimated Gas |
|---|---|
| Flash loan initiation (Aave V3) | 250,000 |
| Flash loan initiation (Balancer) | 180,000 |
| Uniswap V2 swap | 120,000 |
| Uniswap V3 swap (single tick) | 150,000 |
| Uniswap V3 swap (multi tick) | 150,000 + 15,000 per additional tick |
| Curve swap | 200,000 |
| Balancer swap | 130,000 |
| SushiSwap swap (V2 fork) | 120,000 |
| Profit check + repay | 80,000 |
| Base transaction overhead | 21,000 |

**Total for a 3-hop Aave flash loan via Uniswap V2 pools:**
21,000 + 250,000 + 3 * 120,000 + 80,000 = 711,000 gas

At 30 gwei base fee + 2 gwei tip on Ethereum: 711,000 * 32 gwei = 0.02275 ETH ≈ $68
At 0.1 gwei on Arbitrum: 711,000 * 0.1 gwei = 0.0000711 ETH ≈ $0.21

This illustrates why L2 focus is critical — the same trade is 300x cheaper on Arbitrum.

### Configuration Parameters

| Parameter | Type | Default | Range | Effect |
|---|---|---|---|---|
| minSearchAmount | number | 100 | 10-10000 | Min flash loan amount (USD) for ternary search |
| maxSearchAmount | number | 1000000 | 10000-10000000 | Max flash loan amount (USD) |
| searchToleranceUsd | number | 0.01 | 0.001-1.0 | Ternary search precision |
| minNetProfitUsd | number | 10.00 | 0.01-1000 | Absolute minimum profit to execute |
| gasEstimateBuffer | number | 1.2 | 1.0-2.0 | Multiply gas estimate by this (safety margin) |
| riskBufferBasePct | number | 0.10 | 0.01-1.0 | Base risk buffer as % of trade amount |

### Test Cases (10 cases)

| # | Cycle | Amount | Expected | Validates |
|---|---|---|---|---|
| 1 | Simple 2-hop, 1% arb, $10K | Optimal near $5K | Ternary search finds peak |
| 2 | Same cycle, $1M | Lower profit (high slippage) | Amount-dependent profitability |
| 3 | 3-hop with Aave flash loan, Ethereum gas | Profit reduced by ~$60-80 gas | Gas cost correctness |
| 4 | Same 3-hop on Arbitrum | Profit reduced by ~$0.20 gas | L2 gas savings |
| 5 | Route where optimal profit is $0.50 but risk buffer is $1.00 | profitable=false | Risk buffer enforcement |
| 6 | Route using Balancer flash loan (0 fee) vs Aave (0.05%) | Balancer selected, higher profit | Provider selection |
| 7 | Route passing through same pool twice | Second hop uses updated reserves | State continuity in simulation |
| 8 | Route with demand prediction overlay | Uses predicted reserves, profit may differ | Demand prediction integration |
| 9 | All routes unprofitable | Empty execution queue | No-execute when nothing profitable |
| 10 | Route with gas price spike mid-simulation | Re-estimates gas, may abort | Dynamic gas handling |

---

## Algorithm Integration Pipeline

### Execution Flow (Per Block)

```
1. NEW BLOCK EVENT arrives
   ↓
2. Pool State Indexer updates Redis with new reserves (20-100ms)
   ↓
3. Graph Builder incrementally updates edge weights for changed pools (10-50ms)
   ↓
4. Route Discovery runs SPFA from priority tokens (50-200ms)
   ↓
5. Demand Predictor overlays pending tx impacts on pool states (10-30ms)
   ↓
6. Profit Simulator runs ternary search on top-N discovered cycles (50-200ms)
   ↓
7. Best profitable route → Execution Engine constructs transaction (20-50ms)
   ↓
8. Flashbots bundle submitted (10ms)
   ↓
TOTAL: 170-660ms from block to bundle submission
```

### Conflict Resolution

When multiple profitable routes share pools:
1. Sort routes by net profit descending
2. Execute the most profitable route
3. Re-simulate remaining routes with updated (post-first-trade) pool states
4. If any remaining route is still profitable, execute it too
5. Repeat until no profitable routes remain or gas budget exceeded

This greedy approach is optimal for independent routes and near-optimal for overlapping routes given the latency constraint.
