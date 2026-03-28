// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// solhint-disable func-name-mixedcase, func-visibility
// These function names match actual on-chain ABI

interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external payable;

    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy) external;

    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256);

    function get_dy_underlying(int128 i, int128 j, uint256 dx) external view returns (uint256);
}
