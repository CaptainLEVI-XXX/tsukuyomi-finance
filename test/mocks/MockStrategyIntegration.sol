// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {IStrategyIntegration} from "../../src/interfaces/IStrategyIntegration.sol";

// Mock Strategy Integration for testing
contract MockStrategyIntegration is IStrategyIntegration, Test {
    using SafeTransferLib for address;

    address public immutable strategyManager;
    string public name;

    mapping(address => uint256) public balances;

    constructor(address _strategyManager, string memory _name) {
        strategyManager = _strategyManager;
        name = _name;
    }

    function deposit(uint256 amount, address asset) external returns (bool) {
        require(msg.sender == strategyManager, "Only strategy manager");
        // For testing, assume we're depositing USDC
        // address asset = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; // USDC

        asset.safeTransferFrom(strategyManager, address(this), amount);
        balances[asset] += amount;

        return true;
    }

    function withdraw(uint256 amount, address asset) external returns (uint256) {
        require(msg.sender == strategyManager, "Only strategy manager");

        uint256 toWithdraw = amount > balances[asset] ? balances[asset] : amount;
        if (toWithdraw > 0) {
            balances[asset] -= toWithdraw;
            asset.safeTransfer(strategyManager, toWithdraw);
        }

        return toWithdraw;
    }

    function getBalance(address asset) external view returns (uint256) {
        return balances[asset];
    }
}
