// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseStrategyIntegration} from "../AbstractStrategyImpl.sol";
import {IPoolAave} from "../interfaces/IPoolAave.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";

/**
 * @title AaveV3Integration
 * @notice Example integration for Aave V3
 */
abstract contract AaveV3Integration is BaseStrategyIntegration {
    using SafeTransferLib for address;

    IPoolAave public immutable aavePool;
    mapping(address => address) public aTokens; // asset => aToken

    constructor(address _strategyManager, address _owner, address _aavePool)
        BaseStrategyIntegration(_strategyManager, _owner)
    {
        aavePool = IPoolAave(_aavePool);
    }

    function _depositToProtocol(address asset, uint256 amount) internal override returns (bool) {
        asset.safeApprove(address(aavePool), amount);
        aavePool.supply(asset, amount, address(this), 0);
        return true;
    }

    function _withdrawFromProtocol(address asset, uint256 amount) internal override returns (uint256) {
        aavePool.withdraw(asset, amount, address(this));
        return amount;
    }

    function _getProtocolBalance(address asset) internal view override returns (uint256) {
        return aTokens[asset].balanceOf(address(this));
    }
}
