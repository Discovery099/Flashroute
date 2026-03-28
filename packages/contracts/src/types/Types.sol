// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
    address flashLoanVault;
    uint256 flashLoanAmount;
    uint256 minProfit;
    uint256 deadline;
    SwapHop[] hops;
}
