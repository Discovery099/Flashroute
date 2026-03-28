# F1 Smart Contract — Executor Design

**Date:** 2026-03-28
**Phase:** F1
**Status:** Approved

---

## Overview

The `FlashRouteExecutor` Solidity contract receives a flash loan, executes a multi-hop arbitrage swap sequence, repays the flash loan, and sends profits to a configured recipient. It is the on-chain enforcement layer — it will revert on any trade that doesn't meet minimum profit thresholds or that attempts an unauthorized operation.

The contract is chain-agnostic in its logic but deployed with chain-specific router/provider addresses. Initial deployment: Ethereum mainnet and Arbitrum.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chains | ETH + Arbitrum | Deepest liquidity, widest arbitrage spreads; L2 for lower-cost testing |
| Authorization | Operator role (owner-rotatable) | Hot wallet (operator) signs txs; cold wallet (owner) retains control; rotation without redeployment |
| Flash Loan Providers | Balancer (0%) + Aave V3 (0.05%) | Backend cost-optimizer picks best per trade; both callbacks share `_executeSwapSequence` |
| Swap Data Delivery | All data in calldata | Atomic single-tx, no external dependencies, no IPFS latency |
| Slippage Protection | Route-level minProfit + V3 sqrtPriceLimitX96 | Route-level catches gross profit failures; V3 price limits are free and prevent catastrophic tick crossings |

---

## Contract Interface

### State Variables

```solidity
address public owner;                    // Cold wallet — deployer
address public operator;                  // Hot wallet — backend signer
address public pendingOperator;          // Two-step operator rotation
uint256 public minProfitAsset;           // Asset address for minProfit check (the flash-loaned token)
uint256 public minProfitAmount;           // Minimum net profit in minProfitAsset units
bool public paused;                      // Global pause — both owner and operator can toggle
address public profitRecipient;           // Where profits are sent after successful execution
mapping(address => bool) public isBalancer;   // Whitelisted Balancer Vault addresses
mapping(address => bool) public isAavePool;   // Whitelisted Aave V3 Pool addresses
mapping(address => bool) public isAllowedRouter; // Whitelisted DEX routers
mapping(address => bool) public isAllowedToken; // Whitelisted token addresses (reentrancy guard)
```

### Access Control

- **`onlyOwner`**: `transferOwnership`, `acceptOperator`, `setMinProfit`, `setProfitRecipient`, `withdrawToken`, `withdrawETH`, `pause`, `unpause`, `addRouter`, `removeRouter`, `addToken`, `removeToken`
- **`onlyOperator`**: `executeArbitrage` (normal execution path)
- **`ownerOrOperator`**: `pause`, `unpause`, `emergencyWithdraw` — both roles can halt in an emergency

### Constructor

```solidity
constructor(
    address _owner,
    address _operator,
    address _profitRecipient,
    address[] memory _balancerVaults,
    address[] memory _aavePools,
    address[] memory _routers,
    address[] memory _tokens
)
```

Sets `owner = _owner`, `operator = _operator`, `profitRecipient = _profitRecipient`. Populates all whitelist mappings.

---

## Data Structures

### SwapHop

```solidity
struct SwapHop {
    uint8    dexType;      // 1=UniswapV2, 2=UniswapV3, 3=Curve, 4=Balancer
    address  router;       // Router/pool address (used for all dexTypes)
    address  tokenIn;
    address  tokenOut;
    uint256  amountIn;     // For first hop: flash loan amount; for subsequent hops: 0 (use previous output)
    uint256  sqrtPriceLimitX96;  // V3 only — 0 means no limit; non-zero sets slippage protection
}
```

### RouteParams

```solidity
struct RouteParams {
    uint8      flashLoanProvider;  // 1=Balancer, 2=AaveV3
    address    flashLoanToken;     // The token being flash loaned
    uint256    flashLoanAmount;    // Amount being borrowed
    uint256    minProfit;          // Minimum net profit in flashLoanToken units
    uint256    deadline;           // Block timestamp deadline
    SwapHop[]  hops;              // Ordered hop sequence
}
```

### DexType Enum

```solidity
uint8 constant DEX_UNISWAP_V2 = 1;
uint8 constant DEX_UNISWAP_V3 = 2;
uint8 constant DEX_CURVE       = 3;
uint8 constant DEX_BALANCER    = 4;
```

### FlashLoanProvider Enum

```solidity
uint8 constant FL_BALANCER = 1;
uint8 constant FL_AAVE_V3  = 2;
```

---

## Entry Points

### executeArbitrage (operator-only)

```solidity
function executeArbitrage(RouteParams calldata params) external onlyOperator nonReentrant whenNotPaused
```

1. Validate `block.timestamp <= params.deadline`
2. Validate `flashLoanProvider` is 1 or 2
3. Validate `isAllowedToken[params.flashLoanToken]` — flash loan token must be whitelisted
4. Validate each hop: router whitelisted, tokens whitelisted, amountIn > 0 for first hop
5. Validate `minProfitAmount` is set to the right asset (`minProfitAsset == params.flashLoanToken`)
6. Call `_initiateFlashLoan(params)`
7. Emit `Executed(routeHash, profit)`

### _initiateFlashLoan (internal)

```solidity
function _initiateFlashLoan(RouteParams calldata params) internal
```

```solidity
if (params.flashLoanProvider == FL_BALANCER) {
    _validateBalancerVault(flashLoanToken);
    IVault.UserFlashMint[](params.flashLoanToken, params.flashLoanAmount, params);
} else if (params.flashLoanProvider == FL_AAVE_V3) {
    _validateAavePool(flashLoanToken);
    IPool.flashLoan(address(this), params.flashLoanToken, params.flashLoanAmount, params);
}
```

Balancer uses `flashLoan` with `UserFlashMint` mode (no prior approval needed).
Aave uses standard `flashLoan`.

### Balancer Callback — `receiveFlashLoan` (ERC-3156)

```solidity
function receiveFlashLoan(
    address token,
    uint256 amount,
    uint256 fee,
    bytes   calldata data
) external override nonReentrant
```

1. Validate `isBalancerVault[msg.sender]`
2. Decode `RouteParams memory params = abi.decode(data, (RouteParams))`
3. Call `_executeSwapSequence(params, token, amount, fee)`
4. Repay: transfer `amount + fee` back to Balancer Vault
5. Send profit: `IERC20(token).transfer(profitRecipient, IERC20(token).balanceOf(address(this)))`

### Aave V3 Callback — `executeOperation` (ERC-3156)

```solidity
function executeOperation(
    address[]   calldata assets,
    uint256[]   calldata amounts,
    uint256[]   calldata premiums,
    address     initiator,
    bytes       calldata data
) external override nonReentrant returns (bool)
```

1. Validate `isAavePool[msg.sender]`
2. Validate `initiator == address(this)` — Aave calls back to the initiator
3. Decode `RouteParams memory params = abi.decode(data, (RouteParams))`
4. Call `_executeSwapSequence(params, assets[0], amounts[0], premiums[0])`
5. Repay: pull `amounts[0] + premiums[0]` from this contract to Aave Pool
6. Send profit: `IERC20(assets[0]).transfer(profitRecipient, IERC20(assets[0]).balanceOf(address(this)))`
7. Return `true`

---

## Core Execution

### _executeSwapSequence (internal)

```solidity
function _executeSwapSequence(
    RouteParams calldata params,
    address    flashLoanToken,
    uint256    flashLoanAmount,
    uint256    flashLoanFee
) internal
```

1. **Set minProfit for the route:** `minProfitAsset = flashLoanToken; minProfitAmount = params.minProfit`
2. **Approve routers:** For each unique token in the hop sequence (excluding flash loan token), approve routers as needed. Use `safeApprove` pattern to handle existing allowances.
3. **Execute hops in order:**
   ```
   for each hop in params.hops:
       if hop.amountIn == 0:
           // Subsequent hop — use current balance as amountIn
           hop.amountIn = IERC20(hop.tokenIn).balanceOf(address(this))

       if hop.dexType == DEX_UNISWAP_V2:
           _swapUniswapV2(hop)
       else if hop.dexType == DEX_UNISWAP_V3:
           _swapUniswapV3(hop)
       else if hop.dexType == DEX_CURVE:
           _swapCurve(hop)
       else if hop.dexType == DEX_BALANCER:
           _swapBalancer(hop)
   ```
4. **Validate profit:** After all hops, check `IERC20(flashLoanToken).balanceOf(address(this)) >= flashLoanAmount + flashLoanFee + minProfitAmount`. If not, revert with `InsufficientProfit()`.
5. **Emit profit event:** `ProfitRecorded(profit, gasEstimate)` — actual profit amount in token units.

### _swapUniswapV2 (internal)

```solidity
function _swapUniswapV2(SwapHop calldata hop) internal
```

1. Build path: `[hop.tokenIn, hop.tokenOut]`
2. `IERC20(hop.tokenIn).safeApprove(hop.router, hop.amountIn)`
3. Call `IUniswapV2Router02(hop.router).swapExactTokensForTokens(
       hop.amountIn,
       0,            // slippage handled at route level
       path,
       address(this),
       block.timestamp + 300
   )`

### _swapUniswapV3 (internal)

```solidity
function _swapUniswapV3(SwapHop calldata hop) internal
```

1. `IERC20(hop.tokenIn).safeApprove(hop.router, hop.amountIn)`
2. For exact-input V3 swap:
   ```solidity
   IV3SwapRouter.ExactInputParams({
       recipient: address(this),
       deadline: block.timestamp + 300,
       amountIn: hop.amountIn,
       amountOutMinimum: 0,       // Route-level minProfit is the real guard
       path: abi.encodePacked(    // packed format: tokenIn + fee + tokenOut
           hop.tokenIn,
           uint24(hop.fee),        // fee packed as uint24
           hop.tokenOut
       )
   });
   ```
3. **Use `sqrtPriceLimitX96` if provided:** If `hop.sqrtPriceLimitX96 > 0`, pass it as `sqrtPriceLimitX96` in the exactInput call. This prevents V3 from crossing into unfavorable ticks.
4. Note: For the initial launch, we pass fee as a `uint24` packed in the path — the fee tier is encoded in the path per V3's exactInputSingle and exactInput interfaces. We use `exactInput` with packed path rather than `exactInputSingle` to support multi-hop V3 paths.

### _swapCurve (internal)

```solidity
function _swapCurve(SwapHop calldata hop) internal
```

1. Curve metapools use `exchangeunderlying` or `exchange`. The hop.router is the pool address.
2. Determine indices by calling `get_token(0)` and `get_token(1)` on the pool — or use a pre-computed index lookup if available at call time.
3. For simplicity in V1: Curve hops require the pool to have a direct `exchange(i, j, dx, min_dy)` interface. Complex metapools are a future enhancement.
4. `IERC20(hop.tokenIn).safeApprove(hop.router, hop.amountIn)`
5. Call `ICurvePool(hop.router).exchange(0, 1, hop.amountIn, 0)` — indices 0/1 assumed; for general case, pre-compute indices.

### _swapBalancer (internal)

```solidity
function _swapBalancer(SwapHop calldata hop) internal
```

1. Balancer uses `generalizeSwap` or single-asset `swap` through the Vault.
2. The Vault interface: `vault.swap(singleSwap, fundManagement, 0, block.timestamp)`
3. Build `SingleSwap` struct with `poolId` (from hop.router as poolId), `kind= GIVEN_IN`, `assetIn/Out`, `amount=hop.amountIn`, `userData=[]`
4. `IERC20(hop.tokenIn).safeApprove(hop.router, hop.amountIn)`

---

## Admin Functions

### setOperator (owner-only, two-step)

```solidity
function setOperator(address newOperator) external onlyOwner {
    pendingOperator = newOperator;
    emit OperatorChangePending(newOperator);
}

function acceptOperator() external {
    require(msg.sender == pendingOperator, "Not pending operator");
    emit OperatorChanged(operator, pendingOperator);
    operator = pendingOperator;
    pendingOperator = address(0);
}
```

Two-step rotation: owner sets new address → new address calls `acceptOperator()`. Prevents accidental rotation from key loss.

### setMinProfit (owner-only)

```solidity
function setMinProfit(address asset, uint256 amount) external onlyOwner {
    minProfitAsset = asset;
    minProfitAmount = amount;
}
```

Sets the global minimum profit threshold. Updated by the backend based on gas prices and opportunity quality.

### pause / unpause (ownerOrOperator)

Both owner and operator can pause. Only owner can unpause.

```solidity
function pause() external ownerOrOperator { paused = true; }
function unpause() external onlyOwner { paused = false; }
```

### emergencyWithdraw (ownerOrOperator)

```solidity
function emergencyWithdraw(address token, address to, uint256 amount) external ownerOrOperator nonReentrant {
    require(token != address(0), "Invalid token");
    IERC20(token).safeTransfer(to, amount);
    emit EmergencyWithdrawal(token, to, amount, msg.sender);
}
```

For native ETH: `payable(to).transfer(address(this).balance)` with gas limit.

### Token / Router Whitelisting

```solidity
function addRouter(address router) external onlyOwner { isAllowedRouter[router] = true; }
function removeRouter(address router) external onlyOwner { isAllowedRouter[router] = false; }
function addToken(address token) external onlyOwner { isAllowedToken[token] = true; }
function removeToken(address token) external onlyOwner { isAllowedToken[token] = false; }
```

Tokens and routers are strictly whitelisted. No unlisted token or router can be used in a swap.

---

## Security Properties

| Property | Mechanism |
|----------|-----------|
| Caller authorization | `onlyOperator` modifier on `executeArbitrage`; owner can rotate operator |
| Flash loan repayment correctness | Balance check after all hops — contract must have >= borrowed + fee + minProfit |
| No external token drain | All tokens/ routers are whitelisted; `nonReentrant` modifier |
| Reentrancy protection | `nonReentrant` on all external-facing functions |
| Emergency halt | `pause`/`unpause` controls; both owner and operator can pause |
| Profit withdrawal only to configured recipient | Profit goes to `profitRecipient`, set by owner |
| Profitable only execution | `minProfitAmount` reverts if net profit is below threshold |

---

## Deployment Addresses (Initial)

### Ethereum Mainnet

| Contract | Address |
|----------|---------|
| Owner (cold wallet) | TBD — deployer wallet |
| Operator (hot wallet) | TBD — backend signer |
| Profit Recipient | TBD — treasury cold wallet |
| Balancer Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Aave V3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Uniswap V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Uniswap V3 SwapRouter | `0xE592427A0AEce92De3Edee1F18E0157C05861564` |

### Arbitrum

| Contract | Address |
|----------|---------|
| Balancer Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Aave V3 Pool | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Uniswap V2 Router | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| Uniswap V3 SwapRouter | `0xE592427A0AEce92De3Edee1F18E0157C05861564` |

---

## Events

```solidity
event OperatorChangePending(address indexed newOperator);
event OperatorChanged(address indexed oldOperator, address indexed newOperator);
event Executed(bytes32 indexed routeHash, uint256 profit, uint256 gasUsed);
event ProfitRecorded(uint256 profit, uint256 gasEstimate);
event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount, address indexed caller);
event Paused(address indexed by);
event Unpaused(address indexed by);
```

---

## Error Codes

| Error | When |
|-------|------|
| `Unauthorized()` | Caller is neither owner nor operator |
| `NotOperator()` | Caller is not the current operator (for `acceptOperator`) |
| `Paused()` | Contract is paused |
| `DeadlineExceeded()` | `block.timestamp > deadline` |
| `UnsupportedDex()` | `dexType` is not 1-4 |
| `InvalidRouter()` | Router not whitelisted |
| `InvalidToken()` | Token not whitelisted |
| `InsufficientProfit()` | Profit < minProfitAmount after all hops |
| `FlashLoanFailed()` | Flash loan callback returned failure |

---

## Testing Strategy

| # | Test Case | Coverage |
|---|-----------|----------|
| 1 | Single-hop V2 profitable swap | Basic happy path |
| 2 | Two-hop V2 → V3 swap | Multi-hop routing |
| 3 | Three-hop swap with profit | Full route simulation |
| 4 | V3 hop with sqrtPriceLimitX96 | V3 slippage protection |
| 5 | Balancer flash loan callback | Balancer integration |
| 6 | Aave V3 flash loan callback | Aave integration |
| 7 | Unprofitable route reverts at minProfit check | Safety reversion |
| 8 | Operator-only executeArbitrage rejects non-operator | Access control |
| 9 | Owner can rotate operator | Admin function |
| 10 | Emergency withdrawal by owner | Emergency path |
| 11 | Emergency withdrawal by operator | Emergency path |
| 12 | Paused contract rejects executeArbitrage | Pause mechanism |
| 13 | Deadline exceeded reverts | Time guard |
| 14 | Unknown router reverts | Whitelist enforcement |
| 15 | Profit sent to correct recipient | Fund flow |

---

## Files

```
packages/contracts/
├── src/
│   ├── FlashRouteExecutor.sol          # Main contract
│   ├── interfaces/
│   │   ├── IVault.sol                  # Balancer Vault
│   │   ├── IPool.sol                   # Aave V3 Pool
│   │   ├── IUniswapV2Router02.sol      # Uniswap V2
│   │   ├── IV3SwapRouter.sol           # Uniswap V3
│   │   └── ICurvePool.sol              # Curve (basic)
│   └── library/
│       └── Errors.sol                  # Custom errors
├── test/
│   └── FlashRouteExecutor.t.sol        # Foundry tests
├── deploy/
│   └── 001_deploy_executor.s.sol       # Deployment script
└── remappings.txt
```

**Toolchain:** Foundry (forge) — faster iteration than Hardhat for contract development.
