// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {IStrategyIntegration} from "./interfaces/IStrategyIntegration.sol";
import {ReentrancyGuard} from "@solady/utils/ReentrancyGuard.sol";
import {Ownable} from "@solady/auth/Ownable.sol";

/**
 * @title BaseStrategyIntegration
 * @notice Template for strategy integrations (e.g., Aave, Compound, Yearn, etc.)
 * @dev Each protocol integration would extend this base template
 */
abstract contract BaseStrategyIntegration is IStrategyIntegration, ReentrancyGuard, Ownable {
    // ============ State Variables ============

    address public immutable strategyManager;
    mapping(address => uint256) public totalDeposited;
    mapping(address => uint256) public totalHarvested;

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
        if (msg.sender != strategyManager) revert UnauthorizedCaller();
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
     * @dev Protocol-specific harvest logic
     */
    function _harvestFromProtocol(address asset) internal virtual returns (uint256);

    /**
     * @dev Get protocol-specific balance
     */
    function _getProtocolBalance(address asset) internal view virtual returns (uint256);

    /**
     * @dev Emergency withdrawal from protocol
     */
    function _emergencyWithdrawFromProtocol(address asset) internal virtual returns (uint256);

    // ============ External Functions ============

    /**
     * @notice Deposit assets into the protocol
     * @param amount Amount to deposit
     * @return success Whether the deposit was successful
     */
    function deposit(uint256 amount) external override onlyStrategyManager nonReentrant returns (bool) {
        if (amount == 0) revert InvalidAmount();

        // Assume single asset for simplicity - would be passed as parameter in production
        address asset = address(0); // Would get from strategy manager

        // Transfer assets from strategy manager
        IERC20(asset).transferFrom(strategyManager, address(this), amount);

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
    function withdraw(uint256 amount, address asset)
        external
        override
        onlyStrategyManager
        nonReentrant
        returns (uint256)
    {
        if (amount == 0) revert InvalidAmount();

        uint256 actualAmount = _withdrawFromProtocol(asset, amount);

        if (actualAmount == 0) revert WithdrawalFailed();

        // Update accounting
        if (actualAmount <= totalDeposited[asset]) {
            totalDeposited[asset] -= actualAmount;
        } else {
            totalDeposited[asset] = 0;
        }

        // Transfer back to strategy manager
        IERC20(asset).transfer(strategyManager, actualAmount);

        emit Withdrawn(asset, actualAmount);
        return actualAmount;
    }

    /**
     * @notice Harvest yield from the protocol
     * @param asset Asset to harvest
     * @return yield Amount of yield harvested
     */
    function harvest(address asset) external override onlyStrategyManager nonReentrant returns (uint256) {
        uint256 yield = _harvestFromProtocol(asset);

        if (yield > 0) {
            totalHarvested[asset] += yield;

            // Transfer yield to strategy manager
            IERC20(asset).transfer(strategyManager, yield);

            emit Harvested(asset, yield);
        }

        return yield;
    }

    /**
     * @notice Get current balance in the protocol
     * @param asset Asset to check balance for
     * @return balance Current balance
     */
    function getBalance(address asset) external view override returns (uint256) {
        return _getProtocolBalance(asset);
    }

    /**
     * @notice Get expected yield (if protocol provides this info)
     * @param asset Asset to check yield for
     * @return expectedYield Expected yield amount
     */
    function getExpectedYield(address asset) external view override returns (uint256) {
        // Default implementation - protocols can override if they provide yield estimates
        uint256 currentBalance = _getProtocolBalance(asset);
        uint256 deposited = totalDeposited[asset];

        if (currentBalance > deposited) {
            return currentBalance - deposited;
        }
        return 0;
    }

    /**
     * @notice Emergency withdrawal from protocol
     * @return amount Amount withdrawn
     */
    function emergencyWithdraw() external override onlyOwner returns (uint256) {
        // Would iterate through all assets in production
        address asset = address(0); // Placeholder

        uint256 amount = _emergencyWithdrawFromProtocol(asset);

        if (amount > 0) {
            IERC20(asset).transfer(strategyManager, amount);
            emit EmergencyWithdrawn(asset, amount);
        }

        return amount;
    }
}
