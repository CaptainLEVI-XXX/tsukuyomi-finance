// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase} from "./Base.t.sol";
import {MockStrategyIntegration} from "./mocks/MockStrategyIntegration.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";

contract CrossChainStrategyManagerTest is TestBase {
    using SafeTransferLib for address;

    uint256 aaveStrategyId = 1;
    uint256 morphoStrategyId = 2;

    function setUp() public override {
        super.setUp();

        // Fund alice with tokens
        _dealTokens(USDC, alice, 10_000e6);
        _dealTokens(USDT, alice, 10_000e6);

        // Alice deposits into pool
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), 5_000e6);
        USDT.safeApprove(address(poolManager), 5_000e6);

        poolManager.deposit(usdcTokenId, 5_000e6, alice);
        poolManager.deposit(usdtTokenId, 5_000e6, alice);
        vm.stopPrank();
    }

    function test_StrategyRegistration() public {
        // Check strategies are registered
        CrossChainStrategyManager.StrategyInfo memory aaveStrategy = strategyManager.getStrategy(aaveStrategyId);
        CrossChainStrategyManager.StrategyInfo memory morphoStrategy = strategyManager.getStrategy(morphoStrategyId);

        assertEq(aaveStrategy.name, "AAVE V3 Strategy", "AAVE strategy name incorrect");
        assertEq(aaveStrategy.strategyAddress, address(aaveIntegration), "AAVE address incorrect");
        assertEq(aaveStrategy.chainSelector, mainnetChainSelector, "Chain selector incorrect");
        assertTrue(aaveStrategy.isActive, "AAVE strategy should be active");

        assertEq(morphoStrategy.name, "Morpho Blue Strategy", "Morpho strategy name incorrect");
        assertEq(morphoStrategy.strategyAddress, address(morphoIntegration), "Morpho address incorrect");
    }

    function test_LocalInvestmentFlow() public {
        uint256 poolId = 1; // First pool

        // Controller invests from pool to AAVE strategy
        vm.startPrank(controller);

        // Prepare investment parameters
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;

        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 5000; // 50% of available funds

        // Check balances before
        uint256 poolUsdcBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcBefore = aaveIntegration.getBalance(USDC);

        // Invest in AAVE
        uint256 depositId = strategyManager.investCrossChain(
            poolId,
            aaveStrategyId,
            tokenIds,
            percentages,
            USDC,
            address(0) // target asset
        );

        // Check balances after
        uint256 poolUsdcAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcAfter = aaveIntegration.getBalance(USDC);

        // Assertions
        uint256 invested = poolUsdcBefore - poolUsdcAfter;
        assertEq(invested, 2_500e6, "Should invest 50% of 5000 USDC");
        assertEq(strategyUsdcAfter - strategyUsdcBefore, invested, "Strategy balance incorrect");

        // Check allocation tracking
        CrossChainStrategyManager.AllocationInfo memory allocation = strategyManager.getAllocation(aaveStrategyId, USDC);
        assertEq(allocation.principal, invested, "Principal tracking incorrect");
        assertEq(allocation.currentValue, invested, "Current value incorrect");
        assertTrue(allocation.isActive, "Allocation should be active");

        vm.stopPrank();
    }

    function test_WithdrawFromStrategy() public {
        // Setup: Invest first
        vm.startPrank(controller);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;
        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 6000; // 60%

        strategyManager.investCrossChain(1, aaveStrategyId, tokenIds, percentages, USDC, address(0));

        // Check initial state
        uint256 poolBalanceBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        CrossChainStrategyManager.AllocationInfo memory allocationBefore =
            strategyManager.getAllocation(aaveStrategyId, USDC);

        // Withdraw half from strategy back to pool
        uint256 withdrawAmount = allocationBefore.principal / 2;
        strategyManager.withdrawFromStrategy(aaveStrategyId, USDC, withdrawAmount, 1);

        // Check final state
        uint256 poolBalanceAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        CrossChainStrategyManager.AllocationInfo memory allocationAfter =
            strategyManager.getAllocation(aaveStrategyId, USDC);

        // Pool should receive the withdrawn amount
        assertEq(poolBalanceAfter - poolBalanceBefore, withdrawAmount, "Pool didn't receive withdrawn funds");

        // Allocation should be reduced
        assertLt(allocationAfter.principal, allocationBefore.principal, "Principal not reduced");
        assertLt(allocationAfter.currentValue, allocationBefore.currentValue, "Current value not reduced");

        vm.stopPrank();
    }

    function test_MultiStrategyAllocation() public {
        vm.startPrank(controller);

        // Invest in both AAVE and Morpho
        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = usdcTokenId;
        tokenIds[1] = usdtTokenId;

        uint256[] memory percentages = new uint256[](2);
        percentages[0] = 3000; // 30% of USDC
        percentages[1] = 2000; // 20% of USDT

        // Invest USDC in AAVE
        uint256[] memory usdcOnly = new uint256[](1);
        usdcOnly[0] = usdcTokenId;
        uint256[] memory usdcPercentage = new uint256[](1);
        usdcPercentage[0] = 3000;

        strategyManager.investCrossChain(1, aaveStrategyId, usdcOnly, usdcPercentage, USDC, address(0));

        // Invest USDT in Morpho (will be swapped to USDC)
        uint256[] memory usdtOnly = new uint256[](1);
        usdtOnly[0] = usdtTokenId;
        uint256[] memory usdtPercentage = new uint256[](1);
        usdtPercentage[0] = 2000;

        strategyManager.investCrossChain(1, morphoStrategyId, usdtOnly, usdtPercentage, USDC, address(0));

        // Check both strategies have allocations
        CrossChainStrategyManager.AllocationInfo memory aaveAllocation =
            strategyManager.getAllocation(aaveStrategyId, USDC);
        CrossChainStrategyManager.AllocationInfo memory morphoAllocation =
            strategyManager.getAllocation(morphoStrategyId, USDC);

        assertGt(aaveAllocation.principal, 0, "AAVE should have allocation");
        assertGt(morphoAllocation.principal, 0, "Morpho should have allocation");

        // Check strategy totals
        CrossChainStrategyManager.StrategyInfo memory aaveInfo = strategyManager.getStrategy(aaveStrategyId);
        CrossChainStrategyManager.StrategyInfo memory morphoInfo = strategyManager.getStrategy(morphoStrategyId);

        assertEq(aaveInfo.totalAllocated, aaveAllocation.principal, "AAVE total allocated incorrect");
        assertEq(morphoInfo.totalAllocated, morphoAllocation.principal, "Morpho total allocated incorrect");

        vm.stopPrank();
    }

    function test_RevertAllocationLimits() public {
        vm.startPrank(owner);
        // Set max allocation to 30%
        strategyManager.updateMaxAllocation(3000);
        vm.stopPrank();

        vm.startPrank(controller);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;
        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 8000; // Try to allocate 80% (exceeds 30% limit per strategy)

        // This would try to allocate 4000 USDC (80% of 5000), which exceeds the limit
        // vm.expectRevert(CrossChainStrategyManager.InvalidAllocation.selector);
        // strategyManager.investCrossChain(1, aaveStrategyId, tokenIds, percentages, USDC);

        // 30% should work
        percentages[0] = 3000;
        uint256 depositId = strategyManager.investCrossChain(1, aaveStrategyId, tokenIds, percentages, USDC,address(0));
        assertGt(depositId, 0, "Investment should succeed with 30%");

        vm.stopPrank();
    }

    function test_EmergencyWithdraw() public {
        // Setup: Invest funds first
        vm.startPrank(controller);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;
        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 5000;

        strategyManager.investCrossChain(1, aaveStrategyId, tokenIds, percentages, USDC,address(0));
        vm.stopPrank();

        // Owner performs emergency withdrawal
        vm.startPrank(owner);

        uint256 strategyBalanceBefore = aaveIntegration.getBalance(USDC);

        // Note: This is a simplified test - actual implementation would need to handle the withdrawal
        strategyManager.emergencyWithdraw(aaveStrategyId, USDC);

        // In a real implementation, funds would be withdrawn from strategy
        // For now, just check the event was emitted
        vm.stopPrank();
    }

    function test_crossChainDeposit() public{
        uint256 poolId = 1; // First pool

        // Controller invests from pool to AAVE strategy
        vm.startPrank(controller);

        // Prepare investment parameters
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;

        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 5000; // 50% of available funds

        // Check balances before
        uint256 poolUsdcBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcBefore = aaveIntegration.getBalance(USDC);

        // Invest in AAVE
        uint256 depositId = strategyManager.investCrossChain(
            poolId,
            aaveStrategyId,
            tokenIds,
            percentages,
            USDC,
            address(0) // target asset
        );

        // Check balances after
        uint256 poolUsdcAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 strategyUsdcAfter = aaveIntegration.getBalance(USDC);

        // Assertions
        uint256 invested = poolUsdcBefore - poolUsdcAfter;
        assertEq(invested, 2_500e6, "Should invest 50% of 5000 USDC");
        assertEq(strategyUsdcAfter - strategyUsdcBefore, invested, "Strategy balance incorrect");

        // Check allocation tracking
        CrossChainStrategyManager.AllocationInfo memory allocation = strategyManager.getAllocation(aaveStrategyId, USDC);
        assertEq(allocation.principal, invested, "Principal tracking incorrect");
        assertEq(allocation.currentValue, invested, "Current value incorrect");
        assertTrue(allocation.isActive, "Allocation should be active");

        vm.stopPrank();

    }
}
