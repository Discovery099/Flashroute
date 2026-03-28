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
