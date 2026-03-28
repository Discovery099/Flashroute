// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IV3SwapRouter {
    struct ExactInputParams {
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        bytes path;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);

    function exactInputSingle(
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external payable returns (uint256 amountOut);
}
