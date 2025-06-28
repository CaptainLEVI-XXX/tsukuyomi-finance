// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {IStrategyIntegration} from "./interfaces/IStrategyIntegration.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {CustomRevert} from "./libraries/CustomRevert.sol";

/**
 * @title BaseStrategyIntegration
 * @notice Template for strategy integrations (e.g., Aave, Compound, Yearn, etc.)
 * @dev Each protocol integration would extend this base template
 */
abstract contract BaseStrategyIntegration is IStrategyIntegration, Ownable {
    using SafeTransferLib for address;
    using CustomRevert for bytes4;
    // ============ State Variables ============

    address public immutable strategyManager;
    mapping(address => uint256) public totalDeposited;

    // ============ Events ============

    event Deposited(address indexed asset, uint256 amount);
    event Withdrawn(address indexed asset, uint256 amount);
    event Harvested(address indexed asset, uint256 yield);
    event EmergencyWithdrawn(address indexed asset, uint256 amount);

    // ============ Errors ============

    error UnauthorizedCaller();
    error InvalidAmount();
    error WithdrawalFailed();

    // ============ Modifiers ============

    modifier onlyStrategyManager() {
        if (msg.sender != strategyManager) UnauthorizedCaller.selector.revertWith();
        _;
    }

    // ============ Constructor ============

    constructor(address _strategyManager, address _owner) {
        strategyManager = _strategyManager;
        _initializeOwner(_owner);
    }

    // ============ Abstract Functions (To be implemented by each integration) ============

    /**
     * @dev Protocol-specific deposit logic
     */
    function _depositToProtocol(address asset, uint256 amount) internal virtual returns (bool);

    /**
     * @dev Protocol-specific withdrawal logic
     */
    function _withdrawFromProtocol(address asset, uint256 amount) internal virtual returns (uint256);

    /**
     * @dev Get protocol-specific balance
     */
    function _getProtocolBalance(address asset) internal view virtual returns (uint256);

    // ============ External Functions ============

    /**
     * @notice Deposit assets into the protocol
     * @param amount Amount to deposit
     * @return success Whether the deposit was successful
     */
    function deposit(uint256 amount, address asset) external override onlyStrategyManager returns (bool) {
        if (amount == 0) InvalidAmount.selector.revertWith();

        // Transfer assets from strategy manager
        asset.safeTransferFrom(strategyManager, address(this), amount);

        // Deposit to protocol
        bool success = _depositToProtocol(asset, amount);

        if (success) {
            totalDeposited[asset] += amount;
            emit Deposited(asset, amount);
        }

        return success;
    }

    /**
     * @notice Withdraw assets from the protocol
     * @param amount Amount to withdraw
     * @param asset Asset to withdraw
     * @return actualAmount Amount actually withdrawn
     */
    function withdraw(uint256 amount, address asset) external override onlyStrategyManager returns (uint256) {
        if (amount == 0) InvalidAmount.selector.revertWith();

        uint256 actualAmount = _withdrawFromProtocol(asset, amount);

        if (actualAmount == 0) WithdrawalFailed.selector.revertWith();

        // Update accounting
        if (actualAmount <= totalDeposited[asset]) {
            totalDeposited[asset] -= actualAmount;
        } else {
            totalDeposited[asset] = 0;
        }

        // Transfer back to strategy manager
        asset.safeTransfer(strategyManager, actualAmount);

        emit Withdrawn(asset, actualAmount);
        return actualAmount;
    }

    /**
     * @notice Get current balance in the protocol
     * @param asset Asset to check balance for
     * @return balance Current balance
     */
    function getBalance(address asset) external view override returns (uint256) {
        return _getProtocolBalance(asset);
    }
}
