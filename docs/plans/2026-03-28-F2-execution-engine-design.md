# F2 Execution Engine — Design

## Context

Phase F1 deployed the `FlashRouteExecutor` smart contract on Ethereum and Arbitrum. It receives flash loans, executes multi-hop arbitrage swaps, repays the loan, and sends profits to a configurable recipient. Now F2 builds the backend execution engine that detects profitable routes, constructs and submits transactions, and tracks results.

## Decisions Made

- **Web3 library**: ethers v6 (per 01-ARCHITECTURE.md)
- **Flashbots SDK**: @flashbots/ethers-provider-bundle (NOT @flashbots/sdk — that package does not exist)
- **Entry point**: Worker process subscribing to Redis; manual triggers via admin quick actions publishing to same channel
- **EXECUTION_ENABLED**: When false, log opportunities without executing
- **Chain RPC URLs**: Reuse `@flashroute/config` chain configs
- **Execution wallet**: `EXECUTOR_PRIVATE_KEY` from `.env`
- **Bundle targets**: N+1 and N+2 separately; abandon after N+2 not included

## Architecture

```
apps/executor/src/
├── modules/
│   ├── simulation/              (existing)
│   │   ├── profit-simulator.ts
│   │   └── gas-estimator.ts
│   └── execution/
│       ├── transaction-builder.ts   RouteParams encoding
│       ├── flash-loan-provider.ts   BalancerProvider + AaveV3Provider
│       ├── relay/
│       │   ├── relay-provider.ts   interface
│       │   ├── flashbots-relay.ts   Ethereum implementation
│       │   └── sequencer-relay.ts  Arbitrum implementation
│       ├── nonce-manager.ts         per-chain nonce tracking
│       └── tx-tracker.ts            receipt polling + status updates
├── services/
│   └── execution-engine.ts         orchestrates: simulate → build → submit → track
├── channels/
│   └── redis-subscriber.ts         subscribes to fr:route:discovered
├── config/
│   └── execution.config.ts          EXECUTION_ENABLED, flashbots settings
└── workers/
    └── executor.ts                  main entry point
```

## Core Components

### FlashLoanProvider Interface

```typescript
interface IFlashLoanProvider {
  name: 'balancer' | 'aave-v3';
  feeBps: number;
  gasOverhead: number;

  getQuote(token: string, amount: bigint): Promise<FlashLoanQuote>;
  buildCalldata(token: string, amount: bigint, vault: string): Promise<Bytes>;
  validateToken(token: string): Promise<boolean>;
}
```

`getQuote` returns the cost in token units (amount * feeBps / 10000). `buildCalldata` returns the bytes needed to initiate the flash loan from that provider — this is provider-specific (Balancer uses Vault.flashLoan, Aave uses Pool.flashLoan).

Two implementations:
- **BalancerProvider** — fee: 0%, uses Balancer Vault address, `receiveFlashLoan` callback
- **AaveV3Provider** — fee: 0.05%, uses Aave V3 Pool address, `executeOperation` callback

Provider selection is done by `ProfitSimulator` already (cost-aware). The execution engine uses whichever provider the simulation selected.

### RouteParams Encoding

The contract's `RouteParams` struct ABI-encoded as a single `bytes` calldata parameter to `executeArbitrage`:

```solidity
struct RouteParams {
    uint8 flashLoanProvider;   // 1 = Balancer, 2 = Aave V3
    address flashLoanToken;
    address flashLoanVault;     // the vault/pool address for the flash loan
    uint256 flashLoanAmount;
    uint256 minProfit;
    uint256 deadline;
    SwapHop[] hops;
}

struct SwapHop {
    uint8 dexType;            // 1 = V2, 2 = V3, 3 = Curve, 4 = Balancer
    address router;          // pool/router address
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 sqrtPriceLimitX96;  // V3 only; 0 = no limit
}
```

Use `abi.encode()` from ethers — no manual packing needed.

### Relay Strategy

**Ethereum (mainnet)** — `@flashbots/ethers-provider-bundle`:
1. Simulate bundle: `flashbotsProvider.simulate(bundle, targetBlock)`
2. If profitable: `sendBundle(bundle, targetBlock)` for N+1 and N+2
3. Poll `getBundleStatsV2(bundleHash)` every block for 3 blocks
4. If not included after N+2: abandon, log reason

**Arbitrum** — direct submission:
1. Sign tx with executor wallet
2. `provider.sendTransaction()` via ethers — standard public mempool
3. Track receipt for confirmation

On both chains, on revert: decode revert reason from receipt logs if available.

### Nonce Management

Redis key per chain: `fr:nonce:{chainId}`.

```typescript
async reserveNonce(chainId: number): Promise<number>
  // INCR atomically in Redis
  // If Redis miss: fetch from chain, store, then INCR

async syncNonce(chainId: number): Promise<void>
  // On startup and after submission failures
  // Compare Redis pending trades with on-chain nonce, reconcile

async releaseNonce(chainId: number, nonce: number): void
  // Mark nonce dirty on submission failure
  // Next reserveNonce syncs from chain
```

### Transaction Tracker

```typescript
async trackTransaction(
  tradeId: string,
  txHash: string,
  chainId: number
): Promise<ExecutionResult>
  // Poll provider.getTransactionReceipt every ~1s
  // On receipt:
  //   status=1: parse logs → profit amount → update trade: included/settled
  //   status=0: update trade: reverted, decode revert reason
  //   timeout (25 blocks): update trade: expired/failed
```

### Execution Flow

```
ON route discovered (from fr:route:discovered):
  1. Find matching strategy for chain/token pair
  2. If EXECUTION_ENABLED=false: log "would execute", skip
  3. Check execution lock: SETNX fr:lock:{strategyId} with 30s TTL
     - If lock exists: skip, log "opportunity in flight"
  4. Validate simulation freshness: simulation.timestamp must be < 6s old
  5. Check gas price against strategy.maxGasPriceGwei
  6. Check wallet ETH balance > gas reserve (0.05 ETH minimum)
  7. Build RouteParams from simulation result
  8. Reserve nonce for chain
  9. Sign transaction with executor wallet
  10. Submit via appropriate relay:
      - ETH: Flashbots simulate → if profitable, send to N+1 and N+2
      - ARB: direct submission
  11. Create trade record: status=submitted, txHash, chain, route details
  12. Hand off to TxTracker for confirmation monitoring
  13. Release execution lock
```

### Execution Engine Service

```typescript
class ExecutionEngine {
  async execute(route: DiscoveredRoute, strategy: Strategy): Promise<ExecutionResult>

  async shouldExecute(route: DiscoveredRoute, strategy: Strategy): Promise<ExecutionDecision>
    // Returns { approved: boolean, reasons: string[], metrics: {...} }
    // Checks: freshness, gas price, wallet balance, lock status, strategy permits
```

### Result Recording

The trade record is created via `TradeService` (apps/api). Status transitions:

```
detected → simulated → submitted_private/submitted_public → included → settled/reverted
```

After inclusion:
1. Call TradeService to update status to `included`
2. Calculate actual profit from logs (profit amount, gas used, gas price)
3. Update trade with execution details
4. Publish `fr:execution:result` to Redis
5. TradeService pushes to `trades:live` WebSocket channel

### EXECUTION_ENABLED Gate

When `false` in config:
- All subscription logic runs normally
- Routes are validated and logged: `"[SIMULATED] route ${id} profitable=${profit}, would execute"`
- No transaction construction, no signing, no submission
- Useful for validating the full pipeline before enabling live execution

### Failure Classification

| Reason | Description | Auto-pause? |
|--------|-------------|-------------|
| `simulation_revert` | Flashbots simulation reverted | No |
| `not_included` | Bundle not included by N+2 | No |
| `onchain_revert` | Transaction reverted on-chain | Yes (after 5 consecutive) |
| `nonce_conflict` | Nonce collision detected | No |
| `gas_cap_exceeded` | Gas price above strategy cap | No |
| `stale_opportunity` | Simulation too old (>6s) | No |
| `insufficient_wallet_gas` | ETH balance below reserve | Yes |
| `unknown` | Unclassified error | No |

## Environment Variables

```bash
EXECUTOR_ENABLED=true                    # master kill switch
EXECUTOR_PRIVATE_KEY=0x...               # executor operator wallet
EXECUTOR_CHAINS=1,42161                 # active chains
EXECUTOR_GAS_RESERVE_ETH=0.05           # minimum wallet ETH balance
EXECUTOR_STALENESS_THRESHOLD_MS=6000    # max simulation age
EXECUTOR_MAX_PENDING_PER_CHAIN=1        # concurrent submissions per chain
FLASHbotsRelayUrl=https://relay.flashbots.net  # ETH only
BUNDLE_TARGET_BLOCKS=n+1,n+2            # submission targets
```

## Testing

15 test cases from 09-BACKEND-CORE-3.md:

| # | Test | Validates |
|---|------|-----------|
| 1 | Profit simulation 2-hop | Basic simulation still works |
| 2 | Optimal amount search | Ternary search still converges |
| 3 | Provider selection auto | Balancer selected (0% fee) |
| 4 | Provider selection forced | Manual override respected |
| 5 | Swap calldata encoding | RouteParams encodes correctly |
| 6 | Flashbots bundle simulation pass | Simulation succeeds, bundle submitted |
| 7 | Flashbots simulation fail | Bundle not submitted on revert |
| 8 | Transaction confirmation | Trade updated with profit, status=included |
| 9 | Transaction revert | Trade updated with status=reverted |
| 10 | Transaction not included | Trade marked failed after N+2 |
| 11 | Nonce management | Sequential nonces, no conflicts |
| 12 | Profit sweep | Profit extracted to cold wallet |
| 13 | Execution lock | Duplicate opportunity skipped |
| 14 | Auto-pause after 5 failures | Strategy paused on repeated reverts |
| 15 | Gas balance low | Strategies paused when ETH low |

## Dependencies

```json
{
  "ethers": "^6.0.0",
  "@flashbots/ethers-provider-bundle": "^1.0.0",
  "ioredis": "^5.4.0"
}
```

## Relationship to Existing Code

- **apps/executor/src/modules/simulation/** — unchanged, used by ExecutionEngine
- **apps/api/src/modules/trades/trades.service.ts** — trade record CRUD, WebSocket publishing
- **packages/shared/src/constants.ts** — `REDIS_CHANNELS` used for subscription and result publication
- **packages/config/** — `loadEnv()` for chain RPC URLs
- **packages/contracts/** — `FlashRouteExecutor` ABI for `executeArbitrage(RouteParams calldata)`
