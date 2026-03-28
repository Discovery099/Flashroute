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
