// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256 price, uint8 decimals);
    function getPriceInUSD(address asset) external view returns (uint256 priceInUSD);
}