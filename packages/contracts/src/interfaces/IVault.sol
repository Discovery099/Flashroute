// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVault {
    function flashLoan(
        address receiver,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;

    function getFlashLoanFee(address token, uint256 amount) external view returns (uint256);
}
