// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseStrategyIntegration} from "../AbstractStrategyImpl.sol";

/**
 * @title AaveV3Integration
 * @notice Example integration for Aave V3
 */
contract AaveV3Integration is BaseStrategyIntegration {
    address public immutable aavePool;
    mapping(address => address) public aTokens; // asset => aToken

    constructor(address _strategyManager, address _owner, address _aavePool)
        BaseStrategyIntegration(_strategyManager, _owner)
    {
        aavePool = _aavePool;
    }

    function _depositToProtocol(address asset, uint256 amount) internal override returns (bool) {
        // Approve and supply to Aave
        // IERC20(asset).approve(aavePool, amount);
        // IPool(aavePool).supply(asset, amount, address(this), 0);
        return true;
    }

    function _withdrawFromProtocol(address asset, uint256 amount) internal override returns (uint256) {
        // Withdraw from Aave
        // return IPool(aavePool).withdraw(asset, amount, address(this));
        return amount;
    }

    function _harvestFromProtocol(address asset) internal override returns (uint256) {
        // Calculate and collect yield from Aave
        // Yield is automatically accrued in aTokens
        return 0;
    }

    function _getProtocolBalance(address asset) internal view override returns (uint256) {
        // Return aToken balance
        // return IERC20(aTokens[asset]).balanceOf(address(this));
        return 0;
    }

    function _emergencyWithdrawFromProtocol(address asset) internal override returns (uint256) {
        // Withdraw all from Aave
        return _getProtocolBalance(asset);
    }
}
