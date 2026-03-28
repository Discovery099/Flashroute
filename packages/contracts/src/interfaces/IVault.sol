// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// solhint-disable func-name-mixedcase, func-visibility
// These function names match actual on-chain ABI

interface IVault {
    enum SwapKind { GIVEN_IN, GIVEN_OUT }

    struct SingleSwap {
        bytes32 poolId;
        SwapKind kind;
        address assetIn;
        address assetOut;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }

    function flashLoan(
        address receiver,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;

    function getFlashLoanFee(address token, uint256 amount) external view returns (uint256);

    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external payable returns (uint256);
}
