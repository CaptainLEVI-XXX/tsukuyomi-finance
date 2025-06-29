// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase} from "./Base.t.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";

/**
 * @title PoolManagerTest
 * @notice Tests for PoolManager deposit/withdraw and share management functionality
 */
contract PoolManagerTest is TestBase {
    using SafeTransferLib for address;

    function setUp() public override {
        super.setUp();

        // Fund test users with tokens
        dealTokens(USDC, alice, 10_000e6);
        dealTokens(USDT, alice, 10_000e6);
        dealTokens(DAI, alice, 10_000e18);
        dealTokens(USDC, bob, 5_000e6);
    }

    // ============ Basic Deposit/Withdraw Tests ============

    function test_DepositAndWithdraw() public {
        uint256 depositAmount = 1_000e6; // 1,000 USDC

        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);

        // Record initial state
        uint256 sharesBefore = poolManager.balanceOf(alice, usdcTokenId);
        uint256 poolBalanceBefore = USDC.balanceOf(address(poolManager));

        // Execute deposit
        uint256 shares = poolManager.deposit(usdcTokenId, depositAmount, alice);

        // Verify deposit results
        uint256 sharesAfter = poolManager.balanceOf(alice, usdcTokenId);
        uint256 poolBalanceAfter = USDC.balanceOf(address(poolManager));

        assertEq(sharesAfter - sharesBefore, shares, "Shares minted incorrectly");
        assertEq(poolBalanceAfter - poolBalanceBefore, depositAmount, "Pool balance incorrect");
        assertEq(shares, depositAmount, "First deposit should be 1:1");

        // Verify asset info
        _verifyAssetInfo(usdcTokenId, depositAmount, shares);

        // Test withdrawal
        uint256 withdrawShares = shares / 2;
        uint256 aliceBalanceBefore = USDC.balanceOf(alice);

        uint256 withdrawnAssets = poolManager.withdraw(usdcTokenId, withdrawShares, alice);

        uint256 aliceBalanceAfter = USDC.balanceOf(alice);

        assertEq(withdrawnAssets, depositAmount / 2, "Withdrawn amount incorrect");
        assertEq(aliceBalanceAfter - aliceBalanceBefore, withdrawnAssets, "User balance incorrect");
        assertEq(poolManager.balanceOf(alice, usdcTokenId), shares - withdrawShares, "Remaining shares incorrect");

        vm.stopPrank();
    }

    function test_MultipleDepositsAndShareValue() public {
        uint256 aliceDeposit = 1_000e6;
        uint256 bobDeposit = 500e6;

        // Alice deposits first
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), aliceDeposit);
        uint256 aliceShares = poolManager.deposit(usdcTokenId, aliceDeposit, alice);
        vm.stopPrank();

        // Simulate yield by adding funds to strategy manager and returning with yield
        uint256 yield = 100e6; // 100 USDC yield
        dealTokens(USDC, address(strategyManager), yield);

        vm.prank(address(strategyManager));
        USDC.safeApprove(address(poolManager), yield);

        vm.prank(address(strategyManager));
        poolManager.returnFromStrategy(usdcTokenId, 0, yield); // 0 principal, all yield

        // Verify share value increased
        uint256 shareValue = poolManager.getShareValue(usdcTokenId);
        assertGt(shareValue, 1e6, "Share value should be greater than 1:1");

        // Bob deposits after yield
        vm.startPrank(bob);
        USDC.safeApprove(address(poolManager), bobDeposit);
        uint256 bobShares = poolManager.deposit(usdcTokenId, bobDeposit, bob);
        vm.stopPrank();

        // Bob should get fewer shares due to increased share value
        assertLt(bobShares, bobDeposit, "Bob should get fewer shares due to increased share value");

        // Alice's position should be worth more than her initial deposit
        uint256 aliceValue = poolManager.getUserAssetValue(usdcTokenId, alice);
        assertGt(aliceValue, aliceDeposit, "Alice should have gained from yield");
    }

    // ============ Strategy Integration Tests ============

    function test_StrategyAllocationAndReturn() public {
        uint256 depositAmount = 2_000e6;

        // Alice deposits
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Strategy manager allocates funds
        uint256 allocationAmount = 1_500e6; // 75% of pool

        vm.prank(address(strategyManager));
        poolManager.allocateToStrategy(usdcTokenId, allocationAmount);

        // Verify allocation
        uint256 strategyBalance = USDC.balanceOf(address(strategyManager));
        assertEq(strategyBalance, allocationAmount, "Strategy should have allocated amount");

        // Simulate yield and return funds
        uint256 yieldAmount = 150e6; // 10% yield
        deal(USDC, address(strategyManager), strategyBalance + yieldAmount);

        vm.startPrank(address(strategyManager));
        USDC.safeApprove(address(poolManager), allocationAmount + yieldAmount);
        poolManager.returnFromStrategy(usdcTokenId, allocationAmount, yieldAmount);
        vm.stopPrank();

        // Verify return results
        (,, uint128 totalAssets, uint128 allocatedToStrategy,,,,,, uint64 totalYieldEarned) =
            poolManager.assets(usdcTokenId);

        assertEq(allocatedToStrategy, 0, "Should have no outstanding allocation");
        assertEq(totalAssets, depositAmount + yieldAmount, "Total assets should include yield");
        assertEq(totalYieldEarned, yieldAmount, "Yield tracking incorrect");
    }

    function test_InsufficientLiquidityForWithdrawal() public {
        uint256 depositAmount = 1_000e6;

        // Alice deposits
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        uint256 shares = poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Allocate most funds to strategy (80%)
        vm.prank(address(strategyManager));
        poolManager.allocateToStrategy(usdcTokenId, 800e6);

        // Alice tries to withdraw all shares (should fail due to insufficient liquidity)
        vm.startPrank(alice);
        vm.expectRevert();
        poolManager.withdraw(usdcTokenId, shares, alice);

        // Should be able to withdraw available amount (20%)
        uint256 availableShares = shares / 5; // 20% of shares
        uint256 withdrawn = poolManager.withdraw(usdcTokenId, availableShares, alice);
        assertEq(withdrawn, 200e6, "Should withdraw 200 USDC");

        vm.stopPrank();
    }

    // ============ Multi-Asset Tests ============

    function test_MultiAssetPool() public {
        uint256 usdcAmount = 1_000e6;
        uint256 usdtAmount = 2_000e6;
        uint256 daiAmount = 500e18;

        vm.startPrank(alice);

        // Approve all tokens
        USDC.safeApprove(address(poolManager), usdcAmount);
        USDT.safeApprove(address(poolManager), usdtAmount);
        DAI.safeApprove(address(poolManager), daiAmount);

        // Deposit all tokens
        uint256 usdcShares = poolManager.deposit(usdcTokenId, usdcAmount, alice);
        uint256 usdtShares = poolManager.deposit(usdtTokenId, usdtAmount, alice);
        uint256 daiShares = poolManager.deposit(daiTokenId, daiAmount, alice);

        // Verify balances
        assertEq(poolManager.balanceOf(alice, usdcTokenId), usdcShares, "USDC shares incorrect");
        assertEq(poolManager.balanceOf(alice, usdtTokenId), usdtShares, "USDT shares incorrect");
        assertEq(poolManager.balanceOf(alice, daiTokenId), daiShares, "DAI shares incorrect");

        vm.stopPrank();
    }

    // ============ Edge Cases and Error Handling ============

    function test_ZeroAmountDeposit() public {
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), 1000e6);

        vm.expectRevert();
        poolManager.deposit(usdcTokenId, 0, alice);

        vm.stopPrank();
    }

    function test_WithdrawMoreThanBalance() public {
        uint256 depositAmount = 1_000e6;

        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        uint256 shares = poolManager.deposit(usdcTokenId, depositAmount, alice);

        // Try to withdraw more shares than balance
        vm.expectRevert();
        poolManager.withdraw(usdcTokenId, shares + 1, alice);

        vm.stopPrank();
    }

    function test_NonExistentAsset() public {
        vm.startPrank(alice);

        vm.expectRevert();
        poolManager.deposit(999, 1000e6, alice); // Non-existent token ID

        vm.stopPrank();
    }

    // ============ View Function Tests ============

    function test_GetShareValue() public {
        uint256 depositAmount = 1_000e6;

        // Initial share value should be 1:1
        uint256 initialShareValue = poolManager.getShareValue(usdcTokenId);
        assertEq(initialShareValue, 1e6, "Initial share value should be 1:1");

        // Deposit to establish shares
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Add yield
        uint256 yield = 100e6;
        dealTokens(USDC, address(strategyManager), yield);

        vm.prank(address(strategyManager));
        USDC.safeApprove(address(poolManager), yield);

        vm.prank(address(strategyManager));
        poolManager.returnFromStrategy(usdcTokenId, 0, yield);

        // Share value should increase
        uint256 newShareValue = poolManager.getShareValue(usdcTokenId);
        assertGt(newShareValue, initialShareValue, "Share value should increase after yield");
    }

    function test_GetAvailableLiquidity() public {
        uint256 depositAmount = 1_000e6;

        // Before deposit
        uint256 initialLiquidity = poolManager.getAvailableLiquidity(usdcTokenId);
        assertEq(initialLiquidity, 0, "Initial liquidity should be 0");

        // After deposit
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        uint256 liquidityAfterDeposit = poolManager.getAvailableLiquidity(usdcTokenId);
        assertEq(liquidityAfterDeposit, depositAmount, "Liquidity should equal deposit");

        // After allocation
        uint256 allocation = 600e6;
        vm.prank(address(strategyManager));
        poolManager.allocateToStrategy(usdcTokenId, allocation);

        uint256 liquidityAfterAllocation = poolManager.getAvailableLiquidity(usdcTokenId);
        assertEq(liquidityAfterAllocation, depositAmount - allocation, "Liquidity should decrease by allocation");
    }

    function test_GetUserAssetValue() public {
        uint256 depositAmount = 1_000e6;

        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Initial value should equal deposit
        uint256 initialValue = poolManager.getUserAssetValue(usdcTokenId, alice);
        assertEq(initialValue, depositAmount, "Initial user value should equal deposit");

        // Add yield
        uint256 yield = 100e6;
        dealTokens(USDC, address(strategyManager), yield);

        vm.prank(address(strategyManager));
        USDC.safeApprove(address(poolManager), yield);

        vm.prank(address(strategyManager));
        poolManager.returnFromStrategy(usdcTokenId, 0, yield);

        // User value should increase
        uint256 valueAfterYield = poolManager.getUserAssetValue(usdcTokenId, alice);
        assertGt(valueAfterYield, initialValue, "User value should increase after yield");
    }

    // ============ Helper Functions ============

    function _verifyAssetInfo(uint256 tokenId, uint256 expectedAssets, uint256 expectedShares) internal {
        (
            address asset,
            uint96 totalShares,
            uint128 totalAssets,
            uint128 allocatedToStrategy,
            string memory name,
            string memory symbol,
            uint8 decimals,
            bool isActive,
            uint32 lastUpdateTime,
            uint64 totalYieldEarned
        ) = poolManager.assets(tokenId);

        assertEq(totalAssets, expectedAssets, "Total assets incorrect");
        assertEq(totalShares, expectedShares, "Total shares incorrect");
        assertEq(allocatedToStrategy, 0, "Should have no strategy allocation initially");
        assertTrue(isActive, "Asset should be active");
        assertEq(lastUpdateTime, uint32(block.timestamp), "Last update time incorrect");
        assertEq(totalYieldEarned, 0, "Should have no yield initially");

        if (tokenId == usdcTokenId) {
            assertEq(asset, USDC, "Asset address incorrect");
            assertEq(name, "Pool USDC", "Name incorrect");
            assertEq(symbol, "pUSDC", "Symbol incorrect");
            assertEq(decimals, 6, "Decimals incorrect");
        }
    }
}
