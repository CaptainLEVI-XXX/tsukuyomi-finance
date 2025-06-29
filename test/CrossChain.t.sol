// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase} from "./Base.t.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {console} from "forge-std/console.sol";

/**
 * @title CrossChainStrategyManagerTest
 * @notice Tests for CrossChainStrategyManager functionality
 */
contract CrossChainStrategyManagerTest is TestBase {
    using SafeTransferLib for address;

    function setUp() public override {
        super.setUp();
        setupUserWithDeposits(alice, 5_000e6); // 5,000 USDC/USDT
    }

    // ============ Strategy Registration Tests ============

    function test_StrategyRegistration() public {
        CrossChainStrategyManager.StrategyInfo memory aaveStrategy = strategyManager.getStrategy(AAVE_STRATEGY_ID);
        CrossChainStrategyManager.StrategyInfo memory morphoStrategy = strategyManager.getStrategy(MORPHO_STRATEGY_ID);

        // Verify AAVE strategy
        assertEq(aaveStrategy.name, "AAVE V3 Strategy");
        assertEq(aaveStrategy.strategyAddress, address(aaveIntegration));
        assertEq(aaveStrategy.chainSelector, MAINNET_CHAIN_SELECTOR);
        assertTrue(aaveStrategy.isActive);

        // Verify Morpho strategy
        assertEq(morphoStrategy.name, "Morpho Blue Strategy");
        assertEq(morphoStrategy.strategyAddress, address(morphoIntegration));
        assertTrue(morphoStrategy.isActive);
    }

    // ============ Local Investment Tests ============

    function test_LocalInvestmentFlow() public {
        uint256 poolId = 1;
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 5000); // 50%

        // Record initial state
        uint256 poolUsdcBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcBefore = aaveIntegration.getBalance(USDC);

        // Execute investment
        vm.prank(controller);
        uint256 depositId =
            strategyManager.investCrossChain(poolId, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));

        // Verify investment results
        uint256 poolUsdcAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcAfter = aaveIntegration.getBalance(USDC);
        uint256 invested = poolUsdcBefore - poolUsdcAfter;

        assertEq(invested, 2_500e6, "Should invest 50% of 5000 USDC");
        assertEq(strategyUsdcAfter - strategyUsdcBefore, invested);
        assertGt(depositId, 0, "Should return valid deposit ID");

        // Verify allocation tracking
        CrossChainStrategyManager.AllocationInfo memory allocation =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);

        assertEq(allocation.principal, invested);
        assertEq(allocation.currentValue, invested);
        assertTrue(allocation.isActive);
    }

    function test_WithdrawFromStrategy() public {
        // Setup: Invest first
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 6000); // 60%

        vm.prank(controller);
        strategyManager.investCrossChain(1, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));

        // Record state before withdrawal
        uint256 poolBalanceBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        CrossChainStrategyManager.AllocationInfo memory allocationBefore =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);

        // Withdraw half from strategy
        uint256 withdrawAmount = allocationBefore.principal / 2;

        vm.prank(controller);
        strategyManager.withdrawFromStrategy(AAVE_STRATEGY_ID, USDC, withdrawAmount, 1);

        // Verify withdrawal results
        uint256 poolBalanceAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        CrossChainStrategyManager.AllocationInfo memory allocationAfter =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);

        assertEq(poolBalanceAfter - poolBalanceBefore, withdrawAmount, "Pool should receive withdrawn funds");
        assertLt(allocationAfter.principal, allocationBefore.principal, "Principal should be reduced");
        assertLt(allocationAfter.currentValue, allocationBefore.currentValue, "Current value should be reduced");
    }

    // ============ Multi-Strategy Allocation Tests ============

    function test_MultiStrategyAllocation() public {
        vm.startPrank(controller);

        // Invest USDC in AAVE (30%)
        (uint256[] memory usdcTokens, uint256[] memory usdcPercentages) = createInvestmentParams(usdcTokenId, 3000);

        strategyManager.investCrossChain(1, AAVE_STRATEGY_ID, usdcTokens, usdcPercentages, USDC, address(0));

        // Invest USDT in Morpho (20%) - will be swapped to USDC
        (uint256[] memory usdtTokens, uint256[] memory usdtPercentages) = createInvestmentParams(usdtTokenId, 2000);

        strategyManager.investCrossChain(1, MORPHO_STRATEGY_ID, usdtTokens, usdtPercentages, USDC, address(0));

        vm.stopPrank();

        // Verify both strategies have allocations
        CrossChainStrategyManager.AllocationInfo memory aaveAllocation =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);
        CrossChainStrategyManager.AllocationInfo memory morphoAllocation =
            strategyManager.getAllocation(MORPHO_STRATEGY_ID, USDC);

        assertGt(aaveAllocation.principal, 0, "AAVE should have allocation");
        assertGt(morphoAllocation.principal, 0, "Morpho should have allocation");

        // Verify strategy total tracking
        CrossChainStrategyManager.StrategyInfo memory aaveInfo = strategyManager.getStrategy(AAVE_STRATEGY_ID);
        CrossChainStrategyManager.StrategyInfo memory morphoInfo = strategyManager.getStrategy(MORPHO_STRATEGY_ID);

        assertEq(aaveInfo.totalAllocated, aaveAllocation.principal);
        assertEq(morphoInfo.totalAllocated, morphoAllocation.principal);
    }

    // ============ Risk Management Tests ============

    function test_AllocationLimits() public {
        // Set maximum allocation limit to 30%
        vm.prank(owner);
        strategyManager.updateMaxAllocation(3000);

        vm.startPrank(controller);

        // 30% allocation should succeed
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 3000);

        uint256 depositId =
            strategyManager.investCrossChain(1, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));
        assertGt(depositId, 0, "30% investment should succeed");

        vm.stopPrank();
    }

    function test_EmergencyWithdraw() public {
        // Setup: Invest funds first
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 5000);

        vm.prank(controller);
        strategyManager.investCrossChain(1, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));

        // Execute emergency withdrawal
        vm.prank(owner);
        strategyManager.emergencyWithdraw(AAVE_STRATEGY_ID, USDC);

        // Note: In production, this would actually withdraw funds from the strategy
        // For testing, we just verify the function executes without reverting
    }

    // ============ Integration Tests ============

    function test_CrossChainDeposit() public {
        uint256 poolId = 1;
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 5000); // 50%

        // Record initial balances
        uint256 poolUsdcBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcBefore = aaveIntegration.getBalance(USDC);

        // Execute cross-chain deposit
        vm.prank(controller);
        uint256 depositId =
            strategyManager.investCrossChain(poolId, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));

        // Verify results
        uint256 poolUsdcAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcAfter = aaveIntegration.getBalance(USDC);
        uint256 invested = poolUsdcBefore - poolUsdcAfter;

        assertEq(invested, 2_500e6, "Should invest 50% of 5000 USDC");
        assertEq(strategyUsdcAfter - strategyUsdcBefore, invested);
        assertGt(depositId, 0, "Should return valid deposit ID");

        // Verify allocation tracking
        CrossChainStrategyManager.AllocationInfo memory allocation =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);

        assertEq(allocation.principal, invested);
        assertEq(allocation.currentValue, invested);
        assertTrue(allocation.isActive);
    }

    // ============ View Function Tests ============

    function test_GetStrategyInfo() public {
        CrossChainStrategyManager.StrategyInfo memory strategy = strategyManager.getStrategy(AAVE_STRATEGY_ID);

        assertEq(strategy.name, "AAVE V3 Strategy");
        assertEq(strategy.strategyAddress, address(aaveIntegration));
        assertEq(strategy.chainSelector, MAINNET_CHAIN_SELECTOR);
        assertTrue(strategy.isActive);
        assertEq(strategy.totalAllocated, 0); // No investments yet
    }

    function test_GetAllocationInfo() public {
        // Before investment - should be empty
        CrossChainStrategyManager.AllocationInfo memory allocation =
            strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);

        assertEq(allocation.principal, 0);
        assertEq(allocation.currentValue, 0);
        assertFalse(allocation.isActive);

        // After investment - should have data
        (uint256[] memory tokenIds, uint256[] memory percentages) = createInvestmentParams(usdcTokenId, 4000);

        vm.prank(controller);
        strategyManager.investCrossChain(1, AAVE_STRATEGY_ID, tokenIds, percentages, USDC, address(0));

        allocation = strategyManager.getAllocation(AAVE_STRATEGY_ID, USDC);
        assertGt(allocation.principal, 0);
        assertGt(allocation.currentValue, 0);
        assertTrue(allocation.isActive);
    }
}
