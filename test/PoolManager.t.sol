// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase} from "./Base.t.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {console} from "forge-std/console.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";

contract PoolManagerTest is TestBase {
    using SafeTransferLib for address;

    function setUp() public override {
        super.setUp();

        // Give test users some tokens
        _dealTokens(USDC, alice, 10_000e6); // 10,000 USDC
        _dealTokens(USDT, alice, 10_000e6); // 10,000 USDT
        _dealTokens(DAI, alice, 10_000e18); // 10,000 DAI

        _dealTokens(USDC, bob, 5_000e6); // 5,000 USDC
    }

    function test_DepositAndWithdraw() public {
        uint256 depositAmount = 1_000e6; // 1,000 USDC

        // Alice deposits USDC
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);

        uint256 sharesBefore = poolManager.balanceOf(alice, usdcTokenId);
        uint256 poolBalanceBefore = USDC.balanceOf(address(poolManager));

        uint256 shares = poolManager.deposit(usdcTokenId, depositAmount, alice);

        uint256 sharesAfter = poolManager.balanceOf(alice, usdcTokenId);
        uint256 poolBalanceAfter = USDC.balanceOf(address(poolManager));
        {
            // Assertions
            assertEq(sharesAfter - sharesBefore, shares, "Shares minted incorrectly");
            assertEq(poolBalanceAfter - poolBalanceBefore, depositAmount, "Pool balance incorrect");
            assertEq(shares, depositAmount, "First deposit should be 1:1");

            // Check asset info
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
            ) = poolManager.assets(usdcTokenId);
            assertEq(totalAssets, depositAmount, "Total assets incorrect");
            assertEq(totalShares, shares, "Total shares incorrect");
            assertEq(asset, USDC, "Asset incorrect");
            assertEq(name, "Pool USDC", "Name incorrect");
            assertEq(symbol, "pUSDC", "Symbol incorrect");
            assertEq(decimals, 6, "Decimals incorrect");
            assertEq(isActive, true, "Is active incorrect");
            assertEq(lastUpdateTime, uint32(block.timestamp), "Last update time incorrect");
            assertEq(totalYieldEarned, 0, "Total yield earned incorrect");
        }

        // Withdraw half
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
        uint256 aliceDeposit = 1_000e6; // 1,000 USDC
        uint256 bobDeposit = 500e6; // 500 USDC

        // Alice deposits first
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), aliceDeposit);
        uint256 aliceShares = poolManager.deposit(usdcTokenId, aliceDeposit, alice);
        vm.stopPrank();

        // Simulate yield by sending extra USDC to the pool
        uint256 yield = 100e6; // 100 USDC yield
        _dealTokens(USDC, address(strategyManager), yield);

        // Approve strategy manager to withdraw yield
        vm.prank(address(strategyManager));
        USDC.safeApprove(address(poolManager), yield);

        // Manually update pool's totalAssets to reflect yield
        vm.prank(address(strategyManager));
        poolManager.returnFromStrategy(usdcTokenId, 0, yield); // 0 principal, all yield

        // Check share value increased
        uint256 shareValue = poolManager.getShareValue(usdcTokenId);
        assertGt(shareValue, 1e6, "Share value should be greater than 1:1");

        // Bob deposits after yield
        vm.startPrank(bob);
        USDC.safeApprove(address(poolManager), bobDeposit);
        uint256 bobShares = poolManager.deposit(usdcTokenId, bobDeposit, bob);
        vm.stopPrank();

        // Bob should get fewer shares due to increased share value
        assertLt(bobShares, bobDeposit, "Bob should get fewer shares");

        // Alice's position should be worth more than her initial deposit
        uint256 aliceValue = poolManager.getUserAssetValue(usdcTokenId, alice);
        assertGt(aliceValue, aliceDeposit, "Alice should have gained from yield");
    }

    function test_StrategyAllocationAndReturn() public {
        
        uint256 depositAmount = 2_000e6; // 2,000 USDC

        // Alice deposits
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Strategy manager allocates funds
        uint256 allocationAmount = 1_500e6; // 75% of pool

        vm.startPrank(address(strategyManager));
        poolManager.allocateToStrategy(usdcTokenId, allocationAmount);
        vm.stopPrank();

        // Verify allocation worked
        uint256 strategyBalance = USDC.balanceOf(address(strategyManager));
        assertEq(strategyBalance, allocationAmount, "Strategy should have allocated amount");

        // Add yield to strategy manager
        uint256 yieldAmount = 150e6; // 10% yield
        deal(USDC, address(strategyManager), strategyBalance + yieldAmount);

        // Return funds with yield
        vm.startPrank(address(strategyManager));
        USDC.safeApprove(address(poolManager), allocationAmount + yieldAmount);
        poolManager.returnFromStrategy(usdcTokenId, allocationAmount, yieldAmount);
        vm.stopPrank();

        // Verify return worked
        (,, uint128 totalAssets, uint128 allocatedToStrategy,,,,,, uint64 totalYieldEarned) =
            poolManager.assets(usdcTokenId);

        assertEq(allocatedToStrategy, 0, "Should have no allocation");
        assertEq(totalAssets, depositAmount + yieldAmount, "Total assets should include yield");
        assertEq(totalYieldEarned, yieldAmount, "Yield tracking incorrect");
    }

    function test_MaxAllocationLimit() public {
        uint256 depositAmount = 1_000e6; // 1,000 USDC

        // Alice deposits
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Try to allocate more than 80%
        uint256 tooMuchAllocation = 850e6; // 85% of pool

        vm.startPrank(address(strategyManager));
        vm.expectRevert(PoolManager.InvalidAllocation.selector);
        poolManager.allocateToStrategy(usdcTokenId, tooMuchAllocation);

        // 80% should work
        uint256 maxAllocation = 800e6; // 80% of pool
        poolManager.allocateToStrategy(usdcTokenId, maxAllocation);

        vm.stopPrank();
    }

    function test_InsufficientLiquidityForWithdrawal() public {
        uint256 depositAmount = 1_000e6; // 1,000 USDC

        // Alice deposits
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        uint256 shares = poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        // Allocate most funds to strategy
        vm.prank(address(strategyManager));
        poolManager.allocateToStrategy(usdcTokenId, 800e6); // 80% allocated

        // Alice tries to withdraw all (should fail due to insufficient liquidity)
        vm.startPrank(alice);
        vm.expectRevert(PoolManager.InsufficientLiquidity.selector);
        poolManager.withdraw(usdcTokenId, shares, alice);

        // Should be able to withdraw available amount
        uint256 availableShares = shares / 5; // 20% of shares
        uint256 withdrawn = poolManager.withdraw(usdcTokenId, availableShares, alice);
        assertEq(withdrawn, 200e6, "Should withdraw 200 USDC");

        vm.stopPrank();
    }

    function test_MultiAssetPool() public {
        // Test with multiple assets in the pool
        uint256 usdcAmount = 1_000e6;  // 1,000 USDC
        uint256 usdtAmount = 2_000e6;  // 2,000 USDT
        uint256 daiAmount = 500e18;    // 500 DAI

        vm.startPrank(alice);

        // Approve all tokens
        USDC.safeApprove(address(poolManager), usdcAmount);
        USDT.safeApprove(address(poolManager), usdtAmount);
        DAI.safeApprove(address(poolManager), daiAmount);

        // Deposit all tokens
        uint256 usdcShares = poolManager.deposit(usdcTokenId, usdcAmount, alice);
        uint256 usdtShares = poolManager.deposit(usdtTokenId, usdtAmount, alice);
        uint256 daiShares = poolManager.deposit(daiTokenId, daiAmount, alice);


        // Check individual balances
        assertEq(poolManager.balanceOf(alice, usdcTokenId), usdcShares, "USDC shares incorrect");
        assertEq(poolManager.balanceOf(alice, usdtTokenId), usdtShares, "USDT shares incorrect");
        assertEq(poolManager.balanceOf(alice, daiTokenId), daiShares, "DAI shares incorrect");

        vm.stopPrank();
    }
}
