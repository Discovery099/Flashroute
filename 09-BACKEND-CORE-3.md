# Backend Core 3: Execution Engine & Profit Management

---

## Overview

The execution engine is the money-making layer. It takes profitable routes from the analytics engine, simulates them precisely, constructs flash loan transactions, submits them via Flashbots, and tracks results. It also manages profit sweeping and the smart contract executor.

**Files created:** 7 files
**Estimated LOC:** 4,000-5,000

---

## Files

```
src/services/profitSimulator.service.ts    # Full cycle simulation with optimal amount search
src/services/executionEngine.service.ts    # Transaction construction and submission
src/services/flashLoanProvider.service.ts  # Flash loan provider abstraction
src/services/flashbotsSubmitter.service.ts # Flashbots bundle creation and submission
src/services/txManager.service.ts          # Transaction tracking and confirmation
src/services/profitSweeper.service.ts      # Profit extraction to cold wallet
src/workers/executor.ts                    # Worker entry point
```

---

## ProfitSimulatorService (src/services/profitSimulator.service.ts)

### Method: simulateAndOptimize(cycle: ArbitrageCycle, strategy: Strategy): Promise<SimulationResult>

**Purpose:** Given a discovered cycle, find the optimal flash loan amount and simulate the full execution to determine exact net profit.

**Steps:**
1. **Select flash loan provider:** Call FlashLoanProviderService.selectBest(cycle.sourceToken, strategy.flashLoanProvider)
2. **Get current pool states:** Fetch latest reserves from Redis for every pool in the cycle
3. **Apply demand predictions (if enabled):** If strategy.useDemandPrediction, overlay predicted reserves for high-confidence predictions
4. **Run ternary search for optimal amount:**
   - lo = config.minSearchAmount (converted to token units)
   - hi = min(strategy.maxTradeSizeUsd, providerMaxLiquidity) (converted to token units)
   - tolerance = config.searchToleranceUsd (converted to token units)
   - For each candidate amount, call simulateFullCycle()
   - Converge on maximum net profit
5. **Final simulation at optimal amount:** Run one more simulateFullCycle with exact optimal amount
6. **Apply risk buffer:**
   ```
   riskBuffer = strategy.riskBufferPct / 100 * optimalAmount * tokenPrice
   congestionMultiplier = max(1.0, currentBaseFee / 30e9)
   adjustedRiskBuffer = riskBuffer * congestionMultiplier
   ```
7. **Decision:** profitable = netProfitUsd > adjustedRiskBuffer AND netProfitUsd > strategy.minProfitUsd
8. Return SimulationResult

### Method: simulateFullCycle(cycle, amount, poolStates, provider): SimulationDetail

**Steps:**
1. Clone pool states into mutable simulation state
2. Set currentAmount = amount
3. For each hop in cycle.path:
   - Look up pool state from simulation state
   - Calculate output using AMM Price Calculator (Algorithm 1):
     - V2: constant product formula
     - V3: tick-traversal simulation
     - Curve: Newton's method StableSwap
     - Balancer: weighted product formula
   - Record hop result: { amountIn, amountOut, slippagePct, pool }
   - **Critical:** Update simulation pool state (reserves change after each hop)
   - Set currentAmount = amountOut for next hop
4. Calculate grossProfit = currentAmount - amount (in source token)
5. Calculate flashLoanFee = amount * provider.feeRate
6. Estimate gas = sum of per-hop gas estimates + flash loan overhead + base tx cost
7. Convert gas to USD: gasCostUsd = gasEstimate * effectiveGasPrice * nativeTokenPriceUsd
8. netProfitUsd = toUsd(grossProfit - flashLoanFee, sourceToken) - gasCostUsd
9. Return { netProfitUsd, grossProfit, flashLoanFee, gasCost, hopResults, gasEstimate }

---

## FlashLoanProviderService (src/services/flashLoanProvider.service.ts)

### Method: selectBest(token: string, preference: string, chainId: number): Promise<FlashLoanProvider>

**Purpose:** Select the cheapest available flash loan provider for the given token.

**Steps:**
1. If preference != 'auto': return the specified provider (if it supports this token)
2. Check available liquidity for each provider:
   - **Balancer:** Query Vault balance for token. Fee: 0%
   - **dYdX:** Query Solo Margin balance. Fee: 0%. Ethereum only.
   - **Aave V3:** Query aToken supply. Fee: 0.05%
3. Sort by: (1) fee rate ascending, (2) available liquidity descending
4. Return first provider with sufficient liquidity
5. If no provider has enough: throw ExecutionError("Insufficient flash loan liquidity")

### Provider Configurations

| Provider | Fee | Chains | Callback Method | Max Loan |
|---|---|---|---|---|
| Balancer | 0% | ETH, Arbitrum, Polygon, Optimism | `receiveFlashLoan(tokens[], amounts[], feeAmounts[], userData)` | Pool balance |
| dYdX | 0% | Ethereum only | `callFunction(sender, accountInfo, data)` | Margin balance |
| Aave V3 | 0.05% | ETH, Arbitrum, Polygon, Optimism, Base, Avalanche | `executeOperation(assets[], amounts[], premiums[], initiator, params)` | aToken supply |

### Method: getAvailableLiquidity(provider: string, token: string, chainId: number): Promise<bigint>

Query on-chain for available flash loan amount. Cache in Redis for 1 block.

---

## ExecutionEngineService (src/services/executionEngine.service.ts)

### Method: executeArbitrage(simulation: SimulationResult, strategy: Strategy): Promise<ExecutionResult>

**Purpose:** Construct and submit the arbitrage transaction.

**Steps:**
1. **Pre-flight checks:**
   - Verify simulation is still fresh (< 6 seconds old)
   - Verify gas price hasn't spiked above strategy.maxGasPriceGwei
   - Verify executor contract has sufficient ETH for gas
   - Verify no pending execution for this strategy (prevent double-spending)
2. **Encode swap calldata:** Pack the swap sequence into the executor contract's format:
   ```
   [swapCount: uint8]
   For each hop:
     [dexType: uint8] [poolAddress: address] [tokenIn: address] [tokenOut: address] [amountIn: uint256]
   ```
   For the first hop, amountIn = flash loan amount.
   For subsequent hops, amountIn = 0 (use the output of previous hop — contract handles this).
3. **Construct flash loan call:**
   - Encode the executor contract's `executeArbitrage(params)` call with:
     - flashLoanProvider: enum
     - flashLoanToken: address
     - flashLoanAmount: uint256
     - minProfit: uint256 (minimum profit threshold in token units — safety net)
     - swapData: bytes (packed swap calldata from step 2)
4. **Create Flashbots bundle** (if strategy.useFlashbots):
   - Call FlashbotsSubmitterService.submitBundle()
5. **Or submit directly** (if useFlashbots=false or chain doesn't support Flashbots):
   - Sign transaction with execution wallet
   - Submit via provider.sendTransaction()
6. **Create trade record in database:**
   ```sql
   INSERT INTO trades (strategy_id, user_id, chain_id, status, route_path, route_hops,
     flash_loan_provider, flash_loan_token, flash_loan_amount, flash_loan_fee,
     simulated_profit_usd, demand_prediction_used, execution_time_ms)
   VALUES (...)
   ```
7. **Hand off to TxManagerService** for confirmation tracking
8. Return ExecutionResult { tradeId, txHash, status: 'submitted' }

---

## FlashbotsSubmitterService (src/services/flashbotsSubmitter.service.ts)

### Method: submitBundle(signedTx: string, targetBlock: number, chainId: number): Promise<BundleResult>

**Steps:**
1. Create Flashbots bundle:
   ```typescript
   const bundle = [{ signedTransaction: signedTx }]
   ```
2. Simulate bundle: `flashbotsProvider.simulate(bundle, targetBlock)`
3. Check simulation result:
   - If simulation reverts: log reason, return { success: false, reason: 'simulation_revert' }
   - If simulation shows negative profit: return { success: false, reason: 'unprofitable' }
   - If simulation succeeds: proceed to submission
4. Submit bundle: `flashbotsProvider.sendBundle(bundle, targetBlock)`
5. Wait for bundle inclusion (up to 3 blocks):
   - Poll `flashbotsProvider.getBundleStatsV2(bundleHash)` every block
   - If included: return { success: true, txHash, blockNumber }
   - If not included after 3 blocks: return { success: false, reason: 'not_included' }
6. If not included, optionally resubmit with higher tip for next target block (if opportunity still exists)

### Method: getBuilderStats(): Promise<BuilderStats>

Return Flashbots builder statistics for monitoring dashboard.

---

## TxManagerService (src/services/txManager.service.ts)

### Method: trackTransaction(tradeId: string, txHash: string, chainId: number): Promise<void>

**Purpose:** Monitor a submitted transaction until confirmation or failure.

**Steps:**
1. Start polling for transaction receipt: `provider.getTransactionReceipt(txHash)`
2. On receipt received:
   - If status === 1 (success):
     - Decode logs to extract actual profit amount
     - Update trade: status='confirmed', block_number, gas_used, gas_price_gwei
     - Calculate actual profit: parse Transfer events to determine final token balance change
     - Calculate slippage: compare actual profit to simulated profit
     - Count competing arb txs in same block
     - Update trade with all execution details
     - Publish `fr:execution:result` to Redis
   - If status === 0 (revert):
     - Update trade: status='reverted', gas_used (gas is still consumed on revert)
     - Try to decode revert reason from receipt
     - Update trade with error_message
     - Publish `fr:execution:result` with failure details
3. If no receipt after 5 blocks: mark trade as 'failed' with error "not included"
4. Trigger analytics update: AnalyticsService.recordTradeResult()

### Method: getNonce(chainId: number): Promise<number>

**Purpose:** Thread-safe nonce management.

**Steps:**
1. Get nonce from Redis: `fr:nonce:{chainId}`
2. If null: fetch from chain `provider.getTransactionCount(walletAddress)`
3. Increment and store back in Redis atomically (INCR)
4. Return nonce

### Method: syncNonce(chainId: number): Promise<void>

**Purpose:** Re-sync nonce from chain (called on startup and after errors).

---

## ProfitSweeperService (src/services/profitSweeper.service.ts)

### Method: sweepProfits(chainId: number): Promise<SweepResult>

**Purpose:** Transfer accumulated profits from the executor contract to the cold wallet.

**Steps:**
1. Check executor contract balance for all known profit tokens (WETH, USDC, USDT, DAI, WBTC)
2. For each token with balance > dust threshold ($10):
   - Call executor contract: `sweepProfits(tokenAddress, coldWalletAddress, amount)`
   - Wait for confirmation
   - Record sweep in database
3. Check ETH balance: if above gasReserve (0.1 ETH), sweep excess to cold wallet
4. Return { tokensSwept, totalValueUsd }

### Method: scheduleSweep(chainId: number): void

**Purpose:** Set up periodic profit sweeping.

- Trigger every N blocks (config.profitSweepIntervalBlocks, default 100 = ~20 minutes on Ethereum)
- Also trigger when any single token balance exceeds $1000 (immediate sweep for security)

---

## Executor Worker (src/workers/executor.ts)

### Startup Sequence

1. Initialize logger with service='executor'
2. Connect to Redis
3. Sync nonce for all active chains
4. Subscribe to `fr:route:discovered` channel
5. Start profit sweep scheduler
6. Log: "Executor started."

### Main Loop

```
ON ROUTE DISCOVERED (cycle):
  1. Find matching active strategy for this chain/tokens
  2. If no active strategy matches: skip
  3. Check execution lock: only one execution per strategy at a time
  4. ProfitSimulatorService.simulateAndOptimize(cycle, strategy)
  5. If simulation.profitable:
     - Acquire execution lock (Redis SETNX with 30s TTL)
     - ExecutionEngineService.executeArbitrage(simulation, strategy)
     - TxManagerService.trackTransaction(result.tradeId, result.txHash)
     - Release execution lock
  6. If not profitable: log at debug level, skip
```

### Safety Mechanisms

- **Single-threaded execution:** Only one transaction in-flight per chain at a time (prevents nonce conflicts)
- **Execution lock:** Redis SETNX with TTL prevents duplicate execution of same opportunity
- **Max gas cap:** Never submit transaction with gas price above strategy.maxGasPriceGwei
- **Min profit check in contract:** Even if off-chain simulation was wrong, the smart contract checks `finalBalance > borrowedAmount + fee + minProfit` and reverts if not met
- **Auto-pause on repeated failures:** If 5 consecutive trades fail, pause strategy and publish system alert
- **Gas balance monitoring:** If execution wallet ETH balance drops below 0.05 ETH, pause all strategies and alert

---

## Test Cases (15 cases)

| # | Test | Input | Expected | Validates |
|---|---|---|---|---|
| 1 | Profit simulation 2-hop | 2-hop cycle, $10K amount | Positive net profit calculated | Basic simulation |
| 2 | Optimal amount search | 3-hop cycle with known optimal | Ternary search converges within 50 iterations | Amount optimization |
| 3 | Provider selection auto | Token available on Balancer (0%) and Aave (0.05%) | Balancer selected | Provider optimization |
| 4 | Provider selection forced | Strategy.flashLoanProvider='aave' | Aave used regardless of fee | Manual override |
| 5 | Swap calldata encoding | 3-hop V2 route | Packed bytes match expected encoding | Calldata construction |
| 6 | Flashbots bundle simulation pass | Profitable route | Simulation succeeds, bundle submitted | Flashbots flow |
| 7 | Flashbots bundle simulation fail | Route that reverts | Bundle not submitted, logged as 'simulation_revert' | Failure handling |
| 8 | Transaction confirmation | Successful tx receipt | Trade updated with profit, gas, status='confirmed' | Tx tracking |
| 9 | Transaction revert | Failed tx receipt (status=0) | Trade updated with status='reverted', error logged | Revert handling |
| 10 | Transaction not included | No receipt after 5 blocks | Trade marked 'failed' | Timeout handling |
| 11 | Nonce management | 3 rapid executions | Nonces sequential (no gaps, no conflicts) | Nonce safety |
| 12 | Profit sweep | Executor has 0.5 WETH profit | Swept to cold wallet, recorded | Profit extraction |
| 13 | Execution lock prevents double-exec | Same opportunity received twice | Second attempt skipped (lock held) | Lock safety |
| 14 | Auto-pause after 5 failures | 5 consecutive reverts | Strategy paused, alert published | Safety mechanism |
| 15 | Gas balance low | Wallet at 0.03 ETH | All strategies paused, alert sent | Gas monitoring |


---

## Execution Decision Gate and Transaction Assembly Details

The execution engine decides whether to risk gas and competition on a route. That decision must combine simulation output, system state, and chain-specific heuristics.

### Final gate before submission

A route is executable only if all are true:

1. simulation age <= configured staleness threshold,
2. expected net profit USD >= `max(strategy.minProfitUsd, globalMinProfitUsd)`,
3. expected ROI on borrowed capital >= minimum strategy ROI,
4. gas price and bundle bribe remain within configured caps,
5. no overlapping pool set is already in-flight for the same chain,
6. strategy, subscription, and global maintenance state all permit execution,
7. projected post-fee wallet balance remains above gas reserve threshold.

Represent this as a structured `ExecutionDecision` object with `approved`, `reasons[]`, and `metrics`. Do not inline dozens of `if` statements in the controller/worker.

## Calldata and Smart Contract Parameterization

`executeArbitrage()` should produce a compact struct to pass into the executor contract:

- flash loan provider id,
- loan asset,
- loan amount,
- minimum profit in loan asset units,
- deadline block or timestamp,
- swap steps packed bytes,
- expected amount out for each hop or a route-level checksum,
- recipient of profits.

For each hop, include enough data for deterministic execution:

- dex type,
- target pool/router,
- token in/out,
- fee tier or pool id where relevant,
- amount mode (`exact_in` only for initial version recommended),
- optional sqrt price limit for V3,
- minimum hop output if hop-level slippage protection is used.

Route-level slippage checks are cheaper, but hop-level checks localize failure and reduce toxic fills. Preferred design: one route-level minimum final amount plus optional V3 sqrt price limits on sensitive hops.

## Nonce Management and Transaction State Machine

`TxManagerService` must own a nonce state machine per chain wallet. Suggested states for a trade record:

- `detected`,
- `simulated`,
- `approved_for_execution`,
- `submitted_private`,
- `submitted_public_fallback`,
- `included`,
- `reverted`,
- `expired`,
- `replaced`,
- `settled`.

Nonce assignment rules:

1. read latest pending nonce from provider on startup,
2. store next local nonce in Redis `fr:nonce:{chainId}:{wallet}`,
3. reserve nonce with atomic increment before signing,
4. if submission fails before relay acceptance, release or mark nonce dirty and reconcile,
5. on restart, compare local pending trades with on-chain pending nonce to rebuild state.

Never let multiple workers independently call `getTransactionCount('pending')` and assume they can use the returned nonce. That creates conflicts immediately under concurrency.

## Flashbots and Fallback Submission

Private relay submission is preferred, but the service should define explicit fallback rules. For example:

1. simulate via Flashbots relay,
2. if simulation passes, submit bundle for target block N and optionally N+1,
3. monitor inclusion outcome,
4. if not included and opportunity still validates on refreshed simulation, optionally resubmit with adjusted bribe,
5. if relay unavailable and chain policy allows, fall back to protected RPC or public mempool broadcast only when expected edge remains sufficiently high after frontrun risk premium.

Add a `submissionRiskPremiumUsd` parameter. Public fallback should require profit > minimum profit + risk premium, not the same threshold as private submission.

## Profit Sweeping and Treasury Safety

`ProfitSweeperService` moves realized profits from hot executor wallets to a cold treasury. Sweeping must itself be rate-limited and chain-aware because over-sweeping creates operational fragility.

Rules:

- keep minimum working balances in each executor wallet for gas and approvals,
- sweep only when token balance exceeds threshold and no execution is in-flight,
- batch multiple token sweeps when chain supports multicall-like efficiency,
- prefer sweeping into canonical treasury assets (WETH, USDC) after configurable conversion step only if conversion cost is justified,
- record every sweep in database with tx hash, source wallet, destination wallet, token, gross amount, gas cost, net amount.

For security, treasury destination addresses must come from immutable env/config for production. Admin runtime config may toggle sweeping on/off but may not change treasury address from the dashboard.

## Failure Classification

When a trade fails, classify it so analytics and auto-pausing are meaningful:

- `simulation_revert`,
- `relay_rejected`,
- `not_included`,
- `onchain_revert_slippage`,
- `onchain_revert_flashloan`,
- `nonce_conflict`,
- `gas_cap_exceeded`,
- `stale_opportunity`,
- `insufficient_wallet_gas`,
- `unknown`.

Auto-pause logic should count only execution-quality failures relevant to the strategy. Example: `relay_rejected` due to transient service outage should affect system health, not necessarily pause a strategy; repeated `onchain_revert_slippage` should.

## Executor Contract Expectations

The backend relies on the Solidity contract to enforce hard safety checks:

1. caller authorization restricted to backend-controlled signer or owner,
2. flash loan callback verifies initiator/provider,
3. decoded route length bounded to avoid pathological gas usage,
4. unsupported dex type causes immediate revert,
5. final token balance after route must exceed principal + fee + minProfit,
6. profits transferred only after repayment succeeds,
7. reentrancy guarded around external calls where necessary.

This duplication of checks off-chain and on-chain is intentional. The backend optimizes for speed; the contract is the last correctness barrier.
