# F1 Executor Contract — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy a Solidity smart contract (`FlashRouteExecutor`) on Ethereum mainnet and Arbitrum that receives a flash loan, executes a multi-hop arbitrage swap sequence across Uniswap V2/V3, Curve, and Balancer, repays the loan, and sends profits to a configurable recipient. Execution is operator-only; owner is the cold wallet.

**Architecture:** Single `FlashRouteExecutor` contract, chain-agnostic logic, chain-specific deployment addresses. Uses Balancer Vault and Aave V3 Pool for flash loans (ERC-3156 compatible). Uniswap V2/V3 routers for swaps. Operator role (hot wallet) signs execution transactions; owner (cold wallet) controls admin functions and can rotate the operator.

**Toolchain:** Foundry (forge) for Solidity development and testing. Hardhat for deployment scripting (existing infrastructure).

---

## Prerequisites

Before starting, install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

This installs `forge`, `cast`, `anvil`, and `chisel`.

Verify:
```bash
forge --version
# Expected: forge 0.3.0+ (or current)
```

---

## File Structure to Create

```
packages/contracts/
├── foundry.toml                    # Foundry config
├── remappings.txt                  # Path remappings
├── src/
│   ├── FlashRouteExecutor.sol      # Main contract
│   └── library/
│       └── Errors.sol             # Custom error definitions
├── src/interfaces/
│   ├── IVault.sol                 # Balancer Vault (flash loan)
│   ├── IPool.sol                  # Aave V3 Pool (flash loan)
│   ├── IUniswapV2Router02.sol     # Uniswap V2 Router
│   ├── IV3SwapRouter.sol           # Uniswap V3 SwapRouter
│   └── ICurvePool.sol             # Curve (basic)
├── test/
│   └── FlashRouteExecutor.t.sol   # All 15 test cases
└── script/
    └── Deploy.s.sol               # Deployment script
```

---

## Task 1: Scaffold Foundry Project

**Files:**
- Create: `packages/contracts/foundry.toml`
- Create: `packages/contracts/remappings.txt`
- Create: `packages/contracts/.gitignore`

**Step 1: Create foundry.toml**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
cache_path = "cache"

[profile.default.foundry_config]
profile = "default"

[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
arbitrum = "${ARBITRUM_RPC_URL}"

[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
arbitrum = { key = "${ARBISCAN_API_KEY}" }
```

**Step 2: Create remappings.txt**

```
@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/
ds-test/=node_modules/ds-test/src/
forge-std/=node_modules/forge-std/src/
```

**Step 3: Create .gitignore**

```
cache/
out/
lib/
broadcast/
.env
```

**Step 4: Install dependencies**

```bash
cd packages/contracts
npm install --save-dev @openzeppelin/contracts@^5.0.0
npm install --save-dev forge-std ds-test
```

**Step 5: Commit**

```bash
git add packages/contracts/foundry.toml packages/contracts/remappings.txt packages/contracts/.gitignore packages/contracts/package.json
git commit -m "feat(contracts): scaffold Foundry project with OpenZeppelin dependencies"
```

---

## Task 2: Write Custom Errors Library

**Files:**
- Create: `packages/contracts/src/library/Errors.sol`

**Step 1: Write Errors.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Errors {
    error Unauthorized();
    error NotOperator();
    error Paused();
    error DeadlineExceeded();
    error UnsupportedDex(uint8 dexType);
    error InvalidRouter(address router);
    error InvalidToken(address token);
    error InsufficientProfit(uint256 profit, uint256 minProfit);
    error FlashLoanFailed();
    error ZeroAddress();
    error Reentrancy();
}
```

**Step 2: Commit**

```bash
git add packages/contracts/src/library/Errors.sol
git commit -m "feat(contracts): add custom error library"
```

---

## Task 3: Write Interface Contracts

**Files:**
- Create: `packages/contracts/src/interfaces/IVault.sol`
- Create: `packages/contracts/src/interfaces/IPool.sol`
- Create: `packages/contracts/src/interfaces/IUniswapV2Router02.sol`
- Create: `packages/contracts/src/interfaces/IV3SwapRouter.sol`
- Create: `packages/contracts/src/interfaces/ICurvePool.sol`

**Step 1: Write IVault.sol (Balancer Vault — ERC-3156)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVault {
    enum FlashLoanType {BALANCER, REENTRANCY_GUARD, ALL}
    
    struct FlashLoanData {
        FlashLoanType loanType;
        address[] tokens;
        uint256[] amounts;
        uint256[] feeAmounts;
        bytes userData;
    }

    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
    
    function getFlashLoanFee(address token, uint256 amount) external view returns (uint256);
}
```

**Step 2: Write IPool.sol (Aave V3 — ERC-3156)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPool {
    function flashLoan(
        address receiverAddress,
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory interestRateModes,
        address onBehalfOf,
        bytes memory params,
        uint16 referralCode
    ) external;

    function FLASH_LOAN_PREMIUM_TOTAL() external view returns (uint256);
}
```

**Step 3: Write IUniswapV2Router02.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);
    
    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}
```

**Step 4: Write IV3SwapRouter.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IV3SwapRouter {
    struct ExactInputParams {
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes path;  // packed: tokenIn, fee, tokenOut, fee, tokenIn...
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
    function exactInputSingle(address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, address tokenIn, address tokenOut, uint24 fee, uint160 sqrtPriceLimitX96) external payable returns (uint256 amountOut);
}
```

**Step 5: Write ICurvePool.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy) external;
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external payable;
    function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256);
    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256);
}
```

**Step 6: Commit**

```bash
git add packages/contracts/src/interfaces/
git commit -m "feat(contracts): add all DEX and flash loan interfaces"
```

---

## Task 4: Write FlashRouteExecutor Contract

**Files:**
- Create: `packages/contracts/src/FlashRouteExecutor.sol`

This is the main contract. Write it in full. Key sections:

1. **License + pragma** — `// SPDX-License-Identifier: MIT`, `pragma solidity ^0.8.20`
2. **Imports** — OpenZeppelin `ReentrancyGuard`, `IERC20`, `SafeERC20`, interfaces, Errors library
3. **Constants** — DexType and FlashLoanProvider uint8 constants
4. **Structs** — `SwapHop`, `RouteParams`
5. **State variables** — owner, operator, pendingOperator, paused, minProfitAsset, minProfitAmount, profitRecipient, whitelist mappings
6. **Events** — all 7 events from design doc
7. **Modifiers** — `onlyOwner`, `onlyOperator`, `ownerOrOperator`, `whenNotPaused`, `nonReentrant`
8. **Constructor** — initialize all state, populate whitelists for initial deployment
9. **executeArbitrage** — operator-only entry point, validates and calls `_initiateFlashLoan`
10. **_initiateFlashLoan** — branches to Balancer or Aave callback
11. **receiveFlashLoan** — Balancer ERC-3156 callback
12. **executeOperation** — Aave V3 ERC-3156 callback
13. **_executeSwapSequence** — core swap loop, profit check
14. **_swapUniswapV2** — V2 swap with path approval
15. **_swapUniswapV3** — V3 swap with packed path and sqrtPriceLimitX96
16. **_swapCurve** — Curve exchange
17. **_swapBalancer** — Balancer Vault swap
18. **Admin functions** — `setOperator`, `acceptOperator`, `setMinProfit`, `setProfitRecipient`, `pause`, `unpause`, `emergencyWithdraw`, `addRouter`, `removeRouter`, `addToken`, `removeToken`
19. **receive()** — accepts ETH for gas funding

The V3 packed path encoding:
```solidity
// For V3, path is: tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes) + ...
// Use abi.encodePacked(tokenIn, uint24(fee), tokenOut)
```

For the V3 `exactInput`, use packed path format with `IV3SwapRouter(exactInput)`. If `sqrtPriceLimitX96 > 0`, include it as the final parameter. Note that standard V3 routers pass sqrtPriceLimitX96 inside the packed path bytes for `exactInput` — for `exactInputSingle`, it's a separate parameter.

Use the V3 `exactInput` with packed path for multi-hop V3 sequences. Each V3 hop in the overall route becomes a separate `exactInput` call within `_executeSwapSequence`.

**Step 2: Commit**

```bash
git add packages/contracts/src/FlashRouteExecutor.sol
git commit -m "feat(contracts): implement FlashRouteExecutor with Balancer+Aave V3 flash loans and multi-hop swaps"
```

---

## Task 5: Write Deployment Script

**Files:**
- Create: `packages/contracts/script/Deploy.s.sol`

**Step 1: Write Deploy.s.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlashRouteExecutor} from "../src/FlashRouteExecutor.sol";
import {Script} from "forge-std/Script.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(deployerPrivateKey);
        
        // Initial configuration — operator set to owner for initial deployment
        // Owner will call setOperator() after deployment to set the hot wallet
        address operator = owner;
        address profitRecipient = owner;
        
        // Ethereum mainnet addresses
        address[] memory balancerVaults = new address[](1);
        balancerVaults[0] = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
        
        address[] memory aavePools = new address[](1);
        aavePools[0] = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
        
        address[] memory routers = new address[](2);
        routers[0] = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;  // Uniswap V2
        routers[1] = 0xE592427A0AEce92De3Edee1F18E0157C05861564; // Uniswap V3
        
        address[] memory tokens = new address[](6);
        tokens[0] = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // WETH
        tokens[1] = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; // USDC
        tokens[2] = 0xdAC17F958D2ee523a2206206994597C13D831ec7; // USDT
        tokens[3] = 0x6B175474E89094C44Da98b954EescdeCB5BE3830; // DAI
        tokens[4] = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599; // WBTC
        tokens[5] = 0x5fAa25A0a3E3a0a1B3E25045d19A6d6b765f7D1; // FRH (if applicable)
        
        vm.startBroadcast(deployerPrivateKey);
        FlashRouteExecutor executor = new FlashRouteExecutor(
            owner,
            operator,
            profitRecipient,
            balancerVaults,
            aavePools,
            routers,
            tokens
        );
        vm.stopBroadcast();
        
        console.log("FlashRouteExecutor deployed at:", address(executor));
        console.log("Owner:", owner);
    }
}
```

Also write an Arbitrum deployment variant that uses Arbitrum router addresses.

**Step 2: Commit**

```bash
git add packages/contracts/script/
git commit -m "feat(contracts): add deployment scripts for ETH mainnet and Arbitrum"
```

---

## Task 6: Write Tests

**Files:**
- Create: `packages/contracts/test/FlashRouteExecutor.t.sol`

Write all 15 tests from the design doc. Use Foundry's `vm.startPrank` for impersonation and `deal` for ERC-20 token balances.

Key test helpers to create in a base contract:
- `executor` — deployed FlashRouteExecutor
- `owner`, `operator`, `user` — addresses
- `usdc`, `weth` — mock ERC-20 tokens with `deal`
- `balancerVault`, `aavePool` — mock or real testnet addresses
- `v2Router`, `v3Router` — mock or real testnet addresses

**Test 1: Single-hop V2 profitable swap**
- Fund executor with USDC
- Call `executeArbitrage` with 1-hop V2 route that yields profit
- Assert executor balance increased

**Test 2: Two-hop V2 → V3 swap**
- Same pattern, 2 hops

**Test 3: Three-hop swap with profit**
- Full 3-hop route

**Test 4: V3 hop with sqrtPriceLimitX96**
- V3 hop includes non-zero sqrtPriceLimitX96
- Route should still succeed

**Test 5: Unprofitable route reverts at minProfit check**
- Set `minProfitAmount` high enough that route fails
- Assert revert with `Errors.InsufficientProfit`

**Test 6: Operator-only executeArbitrage rejects non-operator**
- `vm.prank(user)` → call `executeArbitrage` → expect revert `Errors.Unauthorized()`

**Test 7: Owner can rotate operator**
- Owner calls `setOperator(newOperator)`
- New operator calls `acceptOperator()`
- Assert `operator == newOperator`

**Test 8: Emergency withdrawal by owner**
- Deal tokens to executor
- Owner calls `emergencyWithdraw(token, recipient, amount)`
- Assert recipient balance increased

**Test 9: Emergency withdrawal by operator**
- Same but `vm.prank(operator)`

**Test 10: Paused contract rejects executeArbitrage**
- Owner or operator calls `pause()`
- Call `executeArbitrage` → expect revert `Errors.Paused()`

**Test 11: Deadline exceeded reverts**
- Pass `deadline = block.timestamp - 1`
- Expect revert `Errors.DeadlineExceeded()`

**Test 12: Unknown router reverts**
- Set up route with non-whitelisted router
- Expect revert `Errors.InvalidRouter()`

**Test 13: Profit sent to correct recipient**
- Verify `profitRecipient` balance increases after profitable trade

**Test 14: Balancer flash loan callback flow**
- Set up a profitable route using Balancer flash loan
- Verify Balancer callback `receiveFlashLoan` fires and repays correctly

**Test 15: Aave V3 flash loan callback flow**
- Same for Aave V3

For mocks, deploy minimal mock contracts or use existing testnet deployments. Foundry's `vm.etch` can also be used to mock interface responses.

**Step 2: Run tests**

```bash
cd packages/contracts
forge test
# Expected: all 15 tests pass
```

**Step 3: Commit**

```bash
git add packages/contracts/test/FlashRouteExecutor.t.sol
git commit -m "test(contracts): add 15 executor contract tests"
```

---

## Task 7: Verify Compilation

**Step 1: Compile**

```bash
cd packages/contracts
forge build
```

**Step 2: Verify no warnings**

If any compiler warnings appear about `receive()` or `fallback()`, fix those before proceeding.

**Step 3: Commit**

```bash
git add packages/contracts/src/
git commit -m "feat(contracts): complete FlashRouteExecutor implementation"
```

---

## Task 8: Update Package.json Scripts

**Files:**
- Modify: `packages/contracts/package.json`

**Step 1: Update package.json**

```json
{
  "scripts": {
    "build": "forge build",
    "test": "forge test",
    "deploy:ethereum": "forge script script/Deploy.s.sol:Deploy --rpc-url mainnet --broadcast",
    "deploy:arbitrum": "forge script script/DeployArbitrum.s.sol:DeployArbitrum --rpc-url arbitrum --broadcast",
    "verify:ethereum": "forge verify-contract CONTRACT_ADDRESS src/FlashRouteExecutor.sol:FlashRouteExecutor --chain-id 1",
    "verify:arbitrum": "forge verify-contract CONTRACT_ADDRESS src/FlashRouteExecutor.sol:FlashRouteExecutor --chain-id 42161"
  }
}
```

**Step 2: Commit**

```bash
git add packages/contracts/package.json
git commit -m "chore(contracts): add forge scripts to package.json"
```

---

## Reference Files

- Design: `docs/plans/2026-03-28-F1-executor-contract-design.md`
- Spec: `09-BACKEND-CORE-3.md` (lines 96-149, 244-277, 305-428)
- Spec: `08-BACKEND-CORE-2.md` (flash loan provider table, lines 96-100)
- Safety: `docs/execution-safety.md`

---

## Test Checklist

- [ ] `forge test` — all 15 tests pass
- [ ] `forge build` — zero compiler errors, zero warnings
- [ ] Gas report reviewed for `_executeSwapSequence` (should be under 2M gas for 3-hop)

---

**Plan complete.** Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
