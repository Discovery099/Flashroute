// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {FlashRouteExecutor} from "../src/FlashRouteExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "../src/library/Errors.sol";
import {SwapHop, RouteParams, DEX_UNISWAP_V2, DEX_UNISWAP_V3, DEX_CURVE, DEX_BALANCER, FL_BALANCER, FL_AAVE_V3} from "../src/types/Types.sol";

abstract contract FlashRouteExecutorTest is Test {
    address internal owner = address(0x1);
    address internal operator = address(0x2);
    address internal user = address(0x3);
    address internal profitRecipient = address(0x4);

    FlashRouteExecutor internal executor;

    address internal constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address internal constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address internal constant V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address internal constant CRV_ROUTER = address(0x0000000000000000000000000000000000000001);

    address internal constant WETH = address(0x10001);
    address internal constant USDC = address(0x10002);
    address internal constant USDT = address(0x10003);
    address internal constant DAI = address(0x10004);
    address internal constant WBTC = address(0x10005);

    MockERC20 internal weth;
    MockERC20 internal usdc;
    MockERC20 internal usdt;
    MockERC20 internal dai;
    MockERC20 internal wbtc;

    MockBalancerVault internal mockBalancerVault;
    MockAavePool internal mockAavePool;
    MockUniswapV2Router internal mockV2Router;
    MockUniswapV3Router internal mockV3Router;

    function setUp() public virtual {
        vm.label(owner, "Owner");
        vm.label(operator, "Operator");
        vm.label(user, "User");
        vm.label(profitRecipient, "ProfitRecipient");

        weth = new MockERC20("WETH", "WETH", 18);
        usdc = new MockERC20("USDC", "USDC", 6);
        usdt = new MockERC20("USDT", "USDT", 6);
        dai = new MockERC20("DAI", "DAI", 18);
        wbtc = new MockERC20("WBTC", "WBTC", 8);

        mockBalancerVault = new MockBalancerVault();
        mockAavePool = new MockAavePool();
        mockV2Router = new MockUniswapV2Router();
        mockV3Router = new MockUniswapV3Router();

        address[] memory balArr = new address[](1);
        balArr[0] = address(mockBalancerVault);
        address[] memory aaveArr = new address[](1);
        aaveArr[0] = address(mockAavePool);
        address[] memory routerArr = new address[](3);
        routerArr[0] = address(mockV2Router);
        routerArr[1] = address(mockV3Router);
        routerArr[2] = CRV_ROUTER;
        address[] memory tokenArr = new address[](5);
        tokenArr[0] = address(weth);
        tokenArr[1] = address(usdc);
        tokenArr[2] = address(usdt);
        tokenArr[3] = address(dai);
        tokenArr[4] = address(wbtc);

        executor = new FlashRouteExecutor(
            owner, operator, profitRecipient, balArr, aaveArr, routerArr, tokenArr
        );

        vm.label(address(executor), "Executor");
        vm.label(address(mockBalancerVault), "MockBalancerVault");
        vm.label(address(mockAavePool), "MockAavePool");
        vm.label(address(mockV2Router), "MockV2Router");
        vm.label(address(mockV3Router), "MockV3Router");
    }

    function _buildSingleHopV2_USDC_TO_WETH(uint256 amountIn, uint256)
        internal
        view
        returns (RouteParams memory)
    {
        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = amountIn;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](1);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: amountIn,
            sqrtPriceLimitX96: 0
        });
    }

    function _buildTwoHopV2toV3_USDC_TO_WETH_TO_DAI(uint256 amountIn, uint256 v2Out, uint256 v3Out)
        internal
        view
        returns (RouteParams memory)
    {
        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = amountIn;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](2);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: amountIn,
            sqrtPriceLimitX96: 0
        });
        params.hops[1] = SwapHop({
            dexType: DEX_UNISWAP_V3,
            router: address(mockV3Router),
            tokenIn: address(weth),
            tokenOut: address(dai),
            amountIn: v2Out > 0 ? v2Out : 1,
            sqrtPriceLimitX96: 0
        });
    }

    function _buildThreeHop_USDC_TO_WETH_TO_WBTC_TO_DAI(uint256 amountIn)
        internal
        view
        returns (RouteParams memory)
    {
        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = amountIn;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](3);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: amountIn,
            sqrtPriceLimitX96: 0
        });
        params.hops[1] = SwapHop({
            dexType: DEX_UNISWAP_V3,
            router: address(mockV3Router),
            tokenIn: address(weth),
            tokenOut: address(wbtc),
            amountIn: 1,
            sqrtPriceLimitX96: 0
        });
        params.hops[2] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(wbtc),
            tokenOut: address(dai),
            amountIn: 1,
            sqrtPriceLimitX96: 0
        });
    }
}

contract MockERC20 is Test {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] = allowed - amount;
        return true;
    }

    function forceApprove(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }
}

contract MockBalancerVault is Test {
    mapping(address => mapping(address => uint256)) public balances;

    function setBalance(address token, address user, uint256 amount) external {
        balances[token][user] = amount;
    }

    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
        uint256 fee = 0;
        for (uint256 i = 0; i < tokens.length; i++) {
            MockERC20(tokens[i]).mint(address(this), amounts[i]);
            MockERC20(tokens[i]).transfer(recipient, amounts[i]);
        }

        FlashRouteExecutor(payable(recipient)).receiveFlashLoan(
            tokens[0], amounts[0], fee, userData
        );

        uint256 repayAmount = amounts[0] + fee;
        MockERC20(tokens[0]).transferFrom(recipient, address(this), repayAmount);
    }
}

contract MockAavePool is Test {
    mapping(address => mapping(address => uint256)) public balances;

    function setBalance(address token, address user, uint256 amount) external {
        balances[token][user] = amount;
    }

    function flashLoan(
        address borrower,
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory modes,
        address,
        bytes calldata params,
        uint256
    ) external {
        uint256 premium = (amounts[0] * 5) / 10000;
        uint256[] memory premiums = new uint256[](1);
        premiums[0] = premium;
        for (uint256 i = 0; i < assets.length; i++) {
            MockERC20(assets[i]).mint(address(this), amounts[i]);
            MockERC20(assets[i]).transfer(borrower, amounts[i]);
        }

        FlashRouteExecutor(payable(borrower)).executeOperation(
            assets, amounts, premiums, address(this), params
        );

        MockERC20(assets[0]).transferFrom(borrower, address(this), amounts[0] + premium);
    }
}

contract MockUniswapV2Router is Test {
    uint256 public swapOutputAmount = 1e18;

    function setSwapOutputAmount(uint256 amount) external {
        swapOutputAmount = amount;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = swapOutputAmount;
        MockERC20(path[path.length - 1]).mint(to, swapOutputAmount);
    }

    function swapExactETHForTokens(uint256, address[] calldata path, address to, uint256)
        external
        payable
        returns (uint256[] memory amounts)
    {
        MockERC20(path[path.length - 1]).mint(to, swapOutputAmount);
        amounts = new uint256[](2);
        amounts[1] = swapOutputAmount;
    }

    function swapExactTokensForETH(uint256 amountIn, uint256, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(path[path.length - 1]).mint(to, swapOutputAmount);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = swapOutputAmount;
    }
}

contract MockUniswapV3Router is Test {
    uint256 public swapOutputAmount = 1e18;

    function setSwapOutputAmount(uint256 amount) external {
        swapOutputAmount = amount;
    }

    function exactInput(IV3SwapRouter.ExactInputParams calldata p) external returns (uint256) {
        address tokenIn = address(bytes20(p.path));
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        address tokenOut = _decodeLastToken(p.path);
        MockERC20(tokenOut).mint(p.recipient, swapOutputAmount);
        return swapOutputAmount;
    }

    function _decodeLastToken(bytes memory path) internal pure returns (address) {
        (address tokenIn, uint24 fee, address tokenOut) = abi.decode(path, (address, uint24, address));
        return tokenOut;
    }
}

interface IV3SwapRouter {
    struct ExactInputParams {
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes path;
    }
    function exactInput(ExactInputParams calldata p) external returns (uint256);
}

contract FlashRouteExecutor_ExecuteArbitrage is FlashRouteExecutorTest {
    function test_singleHopV2_profitableSwap() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 ownFunds = 1000e6;

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        usdc.mint(address(this), ownFunds);
        usdc.transfer(address(executor), ownFunds);
        mockV2Router.setSwapOutputAmount(1e18);

        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = flashLoanAmount;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](1);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: flashLoanAmount,
            sqrtPriceLimitX96: 0
        });

        vm.prank(operator);
        executor.executeArbitrage(params);

        assertGt(weth.balanceOf(profitRecipient), 0);
    }

    function test_twoHopV2toV3_swap() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 v2Output = 100e18;
        uint256 v3Output = 1100e6;

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        mockV2Router.setSwapOutputAmount(v2Output);
        mockV3Router.setSwapOutputAmount(v3Output);

        vm.prank(operator);
        executor.executeArbitrage(_buildTwoHopV2toV3_USDC_TO_WETH_TO_DAI(flashLoanAmount, v2Output, v3Output));

        assertGt(dai.balanceOf(profitRecipient), 0);
    }

    function test_threeHop_swapWithProfit() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 profit = 50e6;

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        mockV2Router.setSwapOutputAmount(1200e6);
        mockV3Router.setSwapOutputAmount(1300e6);

        vm.prank(operator);
        executor.executeArbitrage(_buildThreeHop_USDC_TO_WETH_TO_WBTC_TO_DAI(flashLoanAmount));

        assertGt(dai.balanceOf(profitRecipient), 0);
    }

    function test_v3Hop_withSqrtPriceLimitX96() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 profit = 100e6;

        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = flashLoanAmount;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](1);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V3,
            router: address(mockV3Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: flashLoanAmount,
            sqrtPriceLimitX96: 4295128740
        });

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        mockV3Router.setSwapOutputAmount(flashLoanAmount + profit);

        vm.prank(operator);
        executor.executeArbitrage(params);

        assertGt(weth.balanceOf(profitRecipient), 0);
    }

    function test_revert_unprofitableRoute_insufficientProfit() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 lossAmount = 100e6;

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        mockV2Router.setSwapOutputAmount(flashLoanAmount - lossAmount);

        RouteParams memory params = _buildSingleHopV2_USDC_TO_WETH(flashLoanAmount, 0);
        params.minProfit = 50e6;

        vm.prank(operator);
        vm.expectRevert(Errors.InsufficientProfit.selector);
        executor.executeArbitrage(params);
    }

    function test_revert_nonOperator_callExecuteArbitrage() public {
        RouteParams memory params = _buildSingleHopV2_USDC_TO_WETH(1000e6, 0);
        params.minProfit = 0;

        vm.prank(user);
        vm.expectRevert(Errors.NotOperator.selector);
        executor.executeArbitrage(params);
    }

    function test_ownerRotateOperator() public {
        address newOperator = address(0x999);

        vm.prank(owner);
        executor.setOperator(newOperator);

        vm.prank(newOperator);
        executor.acceptOperator();

        assertEq(executor.operator(), newOperator);
        assertEq(executor.pendingOperator(), address(0));
    }

    function test_ownerEmergencyWithdraw() public {
        uint256 withdrawAmount = 500e18;
        weth.mint(address(executor), withdrawAmount);

        uint256 preBalance = weth.balanceOf(user);

        vm.prank(owner);
        executor.emergencyWithdraw(address(weth), user, withdrawAmount);

        assertEq(weth.balanceOf(user), preBalance + withdrawAmount);
    }

    function test_operatorEmergencyWithdraw() public {
        uint256 withdrawAmount = 300e6;
        usdc.mint(address(executor), withdrawAmount);

        uint256 preBalance = usdc.balanceOf(user);

        vm.prank(operator);
        executor.emergencyWithdraw(address(usdc), user, withdrawAmount);

        assertEq(usdc.balanceOf(user), preBalance + withdrawAmount);
    }

    function test_revert_pausedContract_executeArbitrage() public {
        vm.prank(operator);
        executor.pause();

        RouteParams memory params = _buildSingleHopV2_USDC_TO_WETH(1000e6, 0);

        vm.prank(operator);
        vm.expectRevert(Errors.Paused.selector);
        executor.executeArbitrage(params);
    }

    function test_revert_deadlineExceeded() public {
        RouteParams memory params = _buildSingleHopV2_USDC_TO_WETH(1000e6, 0);
        params.deadline = block.timestamp - 1;

        vm.prank(operator);
        vm.expectRevert(Errors.DeadlineExceeded.selector);
        executor.executeArbitrage(params);
    }

    function test_revert_unknownRouter() public {
        RouteParams memory params;
        params.flashLoanProvider = FL_BALANCER;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockBalancerVault);
        params.flashLoanAmount = 1000e6;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](1);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(0xDEADBEEF),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: 1000e6,
            sqrtPriceLimitX96: 0
        });

        usdc.mint(address(mockBalancerVault), 1000e6);

        vm.prank(operator);
        vm.expectRevert();
        executor.executeArbitrage(params);
    }

    function test_profitSentToCorrectRecipient() public {
        uint256 flashLoanAmount = 1000e6;
        uint256 profit = 20e18;

        usdc.mint(address(mockBalancerVault), flashLoanAmount);
        mockV2Router.setSwapOutputAmount(flashLoanAmount);
        weth.mint(address(executor), profit);

        RouteParams memory params = _buildSingleHopV2_USDC_TO_WETH(flashLoanAmount, flashLoanAmount);
        params.minProfit = 0;

        uint256 preProfitBal = weth.balanceOf(profitRecipient);

        vm.prank(operator);
        executor.executeArbitrage(params);

        assertGt(weth.balanceOf(profitRecipient), preProfitBal);
    }

    function test_BalancerFlashLoan_callbackFlow() public {
        uint256 flashLoanAmount = 500e6;
        uint256 profit = 25e6;

        usdc.mint(address(mockBalancerVault), flashLoanAmount + profit);
        mockV2Router.setSwapOutputAmount(flashLoanAmount + profit);

        vm.prank(operator);
        executor.executeArbitrage(_buildSingleHopV2_USDC_TO_WETH(flashLoanAmount, flashLoanAmount + profit));

        assertGt(weth.balanceOf(profitRecipient), 0);
    }

    function test_AaveV3FlashLoan_callbackFlow() public {
        uint256 flashLoanAmount = 500e6;
        uint256 profit = 15e6;

        RouteParams memory params;
        params.flashLoanProvider = FL_AAVE_V3;
        params.flashLoanToken = address(usdc);
        params.flashLoanVault = address(mockAavePool);
        params.flashLoanAmount = flashLoanAmount;
        params.minProfit = 0;
        params.deadline = block.timestamp + 1 days;
        params.hops = new SwapHop[](1);
        params.hops[0] = SwapHop({
            dexType: DEX_UNISWAP_V2,
            router: address(mockV2Router),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            amountIn: flashLoanAmount,
            sqrtPriceLimitX96: 0
        });

        usdc.mint(address(mockAavePool), flashLoanAmount + profit);
        mockV2Router.setSwapOutputAmount(flashLoanAmount + profit);

        vm.prank(operator);
        executor.executeArbitrage(params);

        assertGt(weth.balanceOf(profitRecipient), 0);
    }
}
