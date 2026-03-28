// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Errors} from "./library/Errors.sol";
import {IVault} from "./interfaces/IVault.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IV3SwapRouter} from "./interfaces/IV3SwapRouter.sol";
import {ICurvePool} from "./interfaces/ICurvePool.sol";

uint8 constant DEX_UNISWAP_V2 = 1;
uint8 constant DEX_UNISWAP_V3 = 2;
uint8 constant DEX_CURVE = 3;
uint8 constant DEX_BALANCER = 4;

uint8 constant FL_BALANCER = 1;
uint8 constant FL_AAVE_V3 = 2;

struct SwapHop {
    uint8 dexType;
    address router;
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 sqrtPriceLimitX96;
}

struct RouteParams {
    uint8 flashLoanProvider;
    address flashLoanToken;
    uint256 flashLoanAmount;
    uint256 minProfit;
    uint256 deadline;
    SwapHop[] hops;
}

contract FlashRouteExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Access control ────────────────────────────────────────────────────
    address public owner;
    address public operator;
    address public pendingOperator;

    // ─── Safety controls ────────────────────────────────────────────────────
    bool public paused;
    address public minProfitAsset;
    uint256 public minProfitAmount;

    // ─── Fund flow ─────────────────────────────────────────────────────────
    address public profitRecipient;

    // ─── Whitelists ────────────────────────────────────────────────────────
    mapping(address => bool) public isBalancerVault;
    mapping(address => bool) public isAavePool;
    mapping(address => bool) public isAllowedRouter;
    mapping(address => bool) public isAllowedToken;

    // ─── Events ────────────────────────────────────────────────────────────
    event OperatorChangePending(address indexed newOperator);
    event OperatorChanged(address indexed oldOperator, address indexed newOperator);
    event Executed(bytes32 indexed routeHash, uint256 profit, uint256 gasEstimate);
    event ProfitRecorded(uint256 profit, uint256 gasEstimate);
    event EmergencyWithdrawal(
        address indexed token,
        address indexed to,
        uint256 amount,
        address indexed caller
    );
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ─── Modifiers ─────────────────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Errors.NotOperator();
        _;
    }

    modifier ownerOrOperator() {
        if (msg.sender != owner && msg.sender != operator) revert Errors.Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Errors.Paused();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────
    constructor(
        address _owner,
        address _operator,
        address _profitRecipient,
        address[] memory _balancerVaults,
        address[] memory _aavePools,
        address[] memory _routers,
        address[] memory _tokens
    ) {
        if (_owner == address(0) || _operator == address(0) || _profitRecipient == address(0)) {
            revert Errors.ZeroAddress();
        }

        owner = _owner;
        operator = _operator;
        profitRecipient = _profitRecipient;

        for (uint256 i = 0; i < _balancerVaults.length; i++) {
            isBalancerVault[_balancerVaults[i]] = true;
        }
        for (uint256 i = 0; i < _aavePools.length; i++) {
            isAavePool[_aavePools[i]] = true;
        }
        for (uint256 i = 0; i < _routers.length; i++) {
            isAllowedRouter[_routers[i]] = true;
        }
        for (uint256 i = 0; i < _tokens.length; i++) {
            isAllowedToken[_tokens[i]] = true;
        }
    }

    // ─── Entry point ───────────────────────────────────────────────────────
    function executeArbitrage(RouteParams calldata params)
        external
        onlyOperator
        nonReentrant
        whenNotPaused
    {
        if (block.timestamp > params.deadline) revert Errors.DeadlineExceeded();
        if (params.flashLoanProvider != FL_BALANCER && params.flashLoanProvider != FL_AAVE_V3) {
            revert Errors.UnsupportedDex(params.flashLoanProvider);
        }
        if (!isAllowedToken[params.flashLoanToken]) revert Errors.InvalidToken(params.flashLoanToken);

        _initiateFlashLoan(params);
    }

    // ─── Flash loan initiation ─────────────────────────────────────────────
    function _initiateFlashLoan(RouteParams calldata params) internal {
        if (params.flashLoanProvider == FL_BALANCER) {
            _validateBalancerFlashLoan(params);
            address[] memory tokens = new address[](1);
            tokens[0] = params.flashLoanToken;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = params.flashLoanAmount;
            IVault(params.flashLoanToken).flashLoan(
                address(this),
                tokens,
                amounts,
                abi.encode(params)
            );
        } else {
            _validateAaveFlashLoan(params);
            address[] memory assets = new address[](1);
            assets[0] = params.flashLoanToken;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = params.flashLoanAmount;
            uint256[] memory modes = new uint256[](1);
            modes[0] = 0;
            IPool(params.flashLoanToken).flashLoan(
                address(this),
                assets,
                amounts,
                modes,
                address(this),
                abi.encode(params),
                0
            );
        }
    }

    function _validateBalancerFlashLoan(RouteParams calldata params) internal view {
        address vault = address(0);
        // The Balancer Vault address is derived from the flashLoanToken being used.
        // For ETH flash loans, the vault handles WETH. We whitelist the vault separately.
        // Use the first whitelisted Balancer vault for this call.
        (bool found,) = _findBalancerVault();
        if (!found) revert Errors.InvalidToken(params.flashLoanToken);
    }

    function _findBalancerVault() internal view returns (bool found, address vault) {
        // Iterate through known Balancer vault addresses
        // In production deployment, the vault address is passed at construction.
        // For ETH-based flash loans, the vault at 0xBA122... handles WETH.
        vault = address(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
        found = isBalancerVault[vault];
    }

    function _validateAaveFlashLoan(RouteParams calldata params) internal view {
        (bool found,) = _findAavePool();
        if (!found) revert Errors.InvalidToken(params.flashLoanToken);
    }

    function _findAavePool() internal view returns (bool found, address pool) {
        pool = address(0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2);
        found = isAavePool[pool];
    }

    // ─── Balancer callback (ERC-3156) ──────────────────────────────────────
    function receiveFlashLoan(
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external nonReentrant {
        if (!isBalancerVault[msg.sender]) revert Errors.Unauthorized();

        RouteParams memory params = abi.decode(data, (RouteParams));

        _executeSwapSequence(params, token, amount, fee);

        // Repay: transfer amount + fee back to vault
        uint256 repayAmount = amount + fee;
        IERC20(token).safeTransfer(msg.sender, repayAmount);

        // Send profit to recipient
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > repayAmount) {
            IERC20(token).safeTransfer(profitRecipient, balance - repayAmount);
        }

        emit ProfitRecorded(balance > repayAmount ? balance - repayAmount : 0, 0);
    }

    // ─── Aave V3 callback (ERC-3156) ──────────────────────────────────────
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address,
        bytes calldata data
    ) external nonReentrant returns (bool) {
        if (!isAavePool[msg.sender]) revert Errors.Unauthorized();

        RouteParams memory params = abi.decode(data, (RouteParams));

        _executeSwapSequence(params, assets[0], amounts[0], premiums[0]);

        // Repay: pull repayment from this contract to Aave Pool
        uint256 repayAmount = amounts[0] + premiums[0];
        IERC20(assets[0]).safeTransfer(msg.sender, repayAmount);

        // Send profit to recipient
        uint256 balance = IERC20(assets[0]).balanceOf(address(this));
        if (balance > repayAmount) {
            IERC20(assets[0]).safeTransfer(profitRecipient, balance - repayAmount);
        }

        emit ProfitRecorded(balance > repayAmount ? balance - repayAmount : 0, 0);

        return true;
    }

    // ─── Core execution ────────────────────────────────────────────────────
    function _executeSwapSequence(
        RouteParams memory params,
        address flashLoanToken,
        uint256 flashLoanAmount,
        uint256 flashLoanFee
    ) internal {
        // Set profit check params
        minProfitAsset = flashLoanToken;
        minProfitAmount = params.minProfit;

        uint256 initialBalance = IERC20(flashLoanToken).balanceOf(address(this));

        // Execute each hop
        for (uint256 i = 0; i < params.hops.length; i++) {
            SwapHop memory hop = params.hops[i];

            // For first hop, use the flash loan amount; for subsequent hops, use current balance
            uint256 amountIn = (i == 0) ? flashLoanAmount : IERC20(hop.tokenIn).balanceOf(address(this));
            if (amountIn == 0) continue;

            if (hop.dexType == DEX_UNISWAP_V2) {
                _swapUniswapV2(hop, amountIn);
            } else if (hop.dexType == DEX_UNISWAP_V3) {
                _swapUniswapV3(hop, amountIn);
            } else if (hop.dexType == DEX_CURVE) {
                _swapCurve(hop, amountIn);
            } else if (hop.dexType == DEX_BALANCER) {
                _swapBalancer(hop, amountIn);
            } else {
                revert Errors.UnsupportedDex(hop.dexType);
            }
        }

        // Verify profit
        uint256 finalBalance = IERC20(flashLoanToken).balanceOf(address(this));
        uint256 profit = finalBalance > initialBalance ? finalBalance - initialBalance : 0;

        if (profit < params.minProfit) {
            revert Errors.InsufficientProfit(profit, params.minProfit);
        }

        emit Executed(keccak256(abi.encode(params)), profit, 0);
    }

    // ─── DEX swap functions ───────────────────────────────────────────────

    function _swapUniswapV2(SwapHop memory hop, uint256 amountIn) internal {
        if (!isAllowedRouter[hop.router]) revert Errors.InvalidRouter(hop.router);
        if (!isAllowedToken[hop.tokenIn] || !isAllowedToken[hop.tokenOut]) {
            revert Errors.InvalidToken(hop.tokenIn);
        }

        address[] memory path = new address[](2);
        path[0] = hop.tokenIn;
        path[1] = hop.tokenOut;

        IERC20(hop.tokenIn).forceApprove(hop.router, amountIn);

        IUniswapV2Router02(hop.router).swapExactTokensForTokens(
            amountIn,
            0,
            path,
            address(this),
            block.timestamp + 300
        );
    }

    function _swapUniswapV3(SwapHop memory hop, uint256 amountIn) internal {
        if (!isAllowedRouter[hop.router]) revert Errors.InvalidRouter(hop.router);
        if (!isAllowedToken[hop.tokenIn] || !isAllowedToken[hop.tokenOut]) {
            revert Errors.InvalidToken(hop.tokenIn);
        }

        IERC20(hop.tokenIn).forceApprove(hop.router, amountIn);

        // Build packed V3 path: tokenIn + fee + tokenOut
        // Fee is encoded as uint24 (3 bytes) packed between token addresses
        bytes memory path = abi.encodePacked(
            hop.tokenIn,
            uint24(3000), // fee tier — packed as uint24 into bytes
            hop.tokenOut
        );

        IV3SwapRouter.ExactInputParams memory p = IV3SwapRouter.ExactInputParams({
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: 0,
            path: path
        });

        IV3SwapRouter(hop.router).exactInput(p);
    }

    function _swapCurve(SwapHop memory hop, uint256 amountIn) internal {
        if (!isAllowedRouter[hop.router]) revert Errors.InvalidRouter(hop.router);
        if (!isAllowedToken[hop.tokenIn] || !isAllowedToken[hop.tokenOut]) {
            revert Errors.InvalidToken(hop.tokenIn);
        }

        IERC20(hop.tokenIn).forceApprove(hop.router, amountIn);

        // Curve pools use int128 indices — we use 0 and 1 as defaults.
        // In production, the correct indices must be encoded in the hop data.
        // For this implementation we use the basic two-coin pool interface.
        try ICurvePool(hop.router).exchange(0, 1, amountIn, 0) {} catch {
            // If 0/1 fails, try underlying
            ICurvePool(hop.router).exchange_underlying(0, 1, amountIn, 0);
        }
    }

    function _swapBalancer(SwapHop memory hop, uint256 amountIn) internal {
        if (!isAllowedToken[hop.tokenIn] || !isAllowedToken[hop.tokenOut]) {
            revert Errors.InvalidToken(hop.tokenIn);
        }

        IERC20(hop.tokenIn).forceApprove(hop.router, amountIn);

        IVault.SingleSwap memory swap = IVault.SingleSwap({
            poolId: bytes32(uint256(uint160(hop.router))),
            kind: IVault.SwapKind.GIVEN_IN,
            assetIn: hop.tokenIn,
            assetOut: hop.tokenOut,
            amount: amountIn,
            userData: bytes("")
        });

        IVault.FundManagement memory funds = IVault.FundManagement({
            sender: address(this),
            fromInternalBalance: false,
            recipient: payable(address(this)),
            toInternalBalance: false
        });

        // hop.router is the Balancer poolId (bytes32 cast to address) for the swap.
        // The Vault address is a global constant — use Balancer Vault on mainnet.
        IVault(balancerVault()).swap(swap, funds, 0, block.timestamp + 300);
    }

    function balancerVault() internal view returns (address) {
        return address(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    }

    // ─── Admin: Operator rotation ─────────────────────────────────────────
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert Errors.ZeroAddress();
        pendingOperator = newOperator;
        emit OperatorChangePending(newOperator);
    }

    function acceptOperator() external {
        if (msg.sender != pendingOperator) revert Errors.NotOperator();
        emit OperatorChanged(operator, pendingOperator);
        operator = pendingOperator;
        pendingOperator = address(0);
    }

    // ─── Admin: Safety controls ───────────────────────────────────────────
    function setMinProfit(address asset, uint256 amount) external onlyOwner {
        minProfitAsset = asset;
        minProfitAmount = amount;
    }

    function setProfitRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert Errors.ZeroAddress();
        profitRecipient = recipient;
    }

    function pause() external ownerOrOperator {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ─── Admin: Whitelist management ──────────────────────────────────────
    function addRouter(address router) external onlyOwner {
        if (router == address(0)) revert Errors.ZeroAddress();
        isAllowedRouter[router] = true;
    }

    function removeRouter(address router) external onlyOwner {
        isAllowedRouter[router] = false;
    }

    function addToken(address token) external onlyOwner {
        if (token == address(0)) revert Errors.ZeroAddress();
        isAllowedToken[token] = true;
    }

    function removeToken(address token) external onlyOwner {
        isAllowedToken[token] = false;
    }

    function addBalancerVault(address vault) external onlyOwner {
        if (vault == address(0)) revert Errors.ZeroAddress();
        isBalancerVault[vault] = true;
    }

    function addAavePool(address pool) external onlyOwner {
        if (pool == address(0)) revert Errors.ZeroAddress();
        isAavePool[pool] = true;
    }

    // ─── Admin: Emergency withdrawal ──────────────────────────────────────
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external ownerOrOperator nonReentrant {
        if (token == address(0) || to == address(0)) revert Errors.ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdrawal(token, to, amount, msg.sender);
    }

    // ─── ETH receiver ─────────────────────────────────────────────────────
    receive() external payable {}
}
