// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Strategy Integration Base Interface
interface IStrategyIntegration {
    function deposit(uint256 amount, address asset) external returns (bool);
    function withdraw(uint256 amount, address asset) external returns (uint256);
    function getBalance(address asset) external view returns (uint256);
}
