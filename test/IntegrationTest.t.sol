// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.28;

// import {TestBase, console2, MockStrategyIntegration} from "./TestBase.sol";
// import {MockERC20} from "./TestBase.sol";

// contract IntegrationTest is TestBase {

//     function setUp() public override {
//         super.setUp();

//         // Fund test users
//         _dealTokens(USDC, alice, 100_000e6);
//         _dealTokens(USDT, alice, 100_000e6);
//         _dealTokens(USDC, bob, 50_000e6);

//         // Add allowed caller for easier testing
//         vm.prank(owner);
//         strategyManager.setAllowedCaller(address(this), true);
//     }

//     function test_CompleteInvestmentLifecycle() public {
//         console2.log("=== Starting Complete Investment Lifecycle Test ===");

//         // Step 1: Users deposit into pool
//         console2.log("\n1. Users depositing into pool...");

//         vm.startPrank(alice);
//         MockERC20(USDC).approve(address(poolManager), 50_000e6);
//         uint256 aliceShares = poolManager.deposit(usdcTokenId, 50_000e6, alice);
//         console2.log("Alice deposited 50,000 USDC, received shares:", aliceShares);
//         vm.stopPrank();

//         vm.startPrank(bob);
//         MockERC20(USDC).approve(address(poolManager), 25_000e6);
//         uint256 bobShares = poolManager.deposit(usdcTokenId, 25_000e6, bob);
//         console2.log("Bob deposited 25,000 USDC, received shares:", bobShares);
//         vm.stopPrank();

//         // Step 2: Controller invests pool funds into strategies
//         console2.log("\n2. Controller investing pool funds into strategies...");

//         vm.startPrank(controller);

//         // Invest 60% of USDC into AAVE
//         uint256[] memory tokenIds = new uint256[](1);
//         tokenIds[0] = usdcTokenId;
//         uint256[] memory percentages = new uint256[](1);
//         percentages[0] = 6000; // 60%

//         uint256 poolBalanceBefore = poolManager.getAvailableLiquidity(usdcTokenId);
//         console2.log("Pool USDC balance before investment:", poolBalanceBefore);

//         uint256 depositId1 = strategyManager.investCrossChain(
//             1, // poolId
//             1, // aaveStrategyId
//             tokenIds,
//             percentages,
//             USDC
//         );

//         uint256 poolBalanceAfter = poolManager.getAvailableLiquidity(usdcTokenId);
//         uint256 investedAmount = poolBalanceBefore - poolBalanceAfter;
//         console2.log("Invested in AAVE:", investedAmount);
//         console2.log("Pool USDC balance after investment:", poolBalanceAfter);

//         // Also invest 20% into Morpho
//         percentages[0] = 2000; // 20% of original amount
//         uint256 depositId2 = strategyManager.investCrossChain(
//             1, // poolId
//             2, // morphoStrategyId
//             tokenIds,
//             percentages,
//             USDC
//         );

//         vm.stopPrank();

//         // Step 3: Generate yield in strategies
//         console2.log("\n3. Generating yield in strategies...");

//         uint256 aaveYield = 4_500e6; // 10% yield on 45k
//         uint256 morphoYield = 1_500e6; // 10% yield on 15k

//         aaveIntegration.generateYield(USDC, aaveYield);
//         morphoIntegration.generateYield(USDC, morphoYield);
//         console2.log("Generated AAVE yield:", aaveYield);
//         console2.log("Generated Morpho yield:", morphoYield);

//         // Step 4: Harvest yields
//         console2.log("\n4. Harvesting yields from strategies...");

//         vm.startPrank(controller);

//         address[] memory assets = new address[](1);
//         assets[0] = USDC;

//         strategyManager.harvestYield(1, assets); // AAVE
//         strategyManager.harvestYield(2, assets); // Morpho

//         // Check updated allocations
//         CrossChainStrategyManager.AllocationInfo memory aaveAlloc = strategyManager.getAllocation(1, USDC);
//         CrossChainStrategyManager.AllocationInfo memory morphoAlloc = strategyManager.getAllocation(2, USDC);

//         console2.log("AAVE allocation - Principal:", aaveAlloc.principal, "Current Value:", aaveAlloc.currentValue);
//         console2.log("Morpho allocation - Principal:", morphoAlloc.principal, "Current Value:", morphoAlloc.currentValue);

//         vm.stopPrank();

//         // Step 5: Withdraw from strategies back to pool
//         console2.log("\n5. Withdrawing funds from strategies back to pool...");

//         vm.startPrank(controller);

//         // Withdraw all from AAVE (principal + yield)
//         strategyManager.withdrawFromStrategy(1, USDC, aaveAlloc.currentValue, 1);

//         // Withdraw all from Morpho
//         strategyManager.withdrawFromStrategy(2, USDC, morphoAlloc.currentValue, 1);

//         vm.stopPrank();

//         // Step 6: Check pool has received funds + yield
//         console2.log("\n6. Checking pool state after strategy returns...");

//         PoolManager.AssetInfo memory assetInfo = poolManager.assets(usdcTokenId);
//         uint256 totalYield = aaveYield + morphoYield;

//         console2.log("Pool total assets:", assetInfo.totalAssets);
//         console2.log("Pool total yield earned:", assetInfo.totalYieldEarned);
//         console2.log("Expected total (75k + 6k yield):", 75_000e6 + totalYield);

//         assertEq(assetInfo.totalAssets, 75_000e6 + totalYield, "Pool should have original + yield");
//         assertEq(assetInfo.totalYieldEarned, totalYield, "Total yield tracking incorrect");

//         // Step 7: Users withdraw with profits
//         console2.log("\n7. Users withdrawing with profits...");

//         // Calculate share values
//         uint256 shareValue = poolManager.getShareValue(usdcTokenId);
//         console2.log("Current share value:", shareValue);
//         console2.log("Initial share value was:", 1e6);

//         // Alice withdraws all shares
//         vm.startPrank(alice);
//         uint256 aliceBalanceBefore = MockERC20(USDC).balanceOf(alice);
//         uint256 aliceWithdrawn = poolManager.withdraw(usdcTokenId, aliceShares, alice);
//         uint256 aliceBalanceAfter = MockERC20(USDC).balanceOf(alice);
//         uint256 aliceProfit = aliceWithdrawn - 50_000e6;

//         console2.log("Alice withdrew:", aliceWithdrawn);
//         console2.log("Alice profit:", aliceProfit);
//         console2.log("Alice profit %:", (aliceProfit * 100) / 50_000e6, "%");
//         vm.stopPrank();

//         // Bob withdraws all shares
//         vm.startPrank(bob);
//         uint256 bobWithdrawn = poolManager.withdraw(usdcTokenId, bobShares, bob);
//         uint256 bobProfit = bobWithdrawn - 25_000e6;

//         console2.log("Bob withdrew:", bobWithdrawn);
//         console2.log("Bob profit:", bobProfit);
//         console2.log("Bob profit %:", (bobProfit * 100) / 25_000e6, "%");
//         vm.stopPrank();

//         // Verify total distributions
//         uint256 totalDistributed = aliceWithdrawn + bobWithdrawn;
//         console2.log("\nTotal distributed to users:", totalDistributed);
//         console2.log("Total yield generated:", totalYield);

//         // Both users should have received proportional yield
//         assertGt(aliceProfit, 0, "Alice should have profit");
//         assertGt(bobProfit, 0, "Bob should have profit");
//         assertEq(aliceProfit + bobProfit, totalYield, "Total profits should equal total yield");

//         console2.log("\n=== Investment Lifecycle Complete ===");
//     }

//     function test_MultiAssetStrategyInvestment() public {
//         console2.log("=== Multi-Asset Strategy Investment Test ===");

//         // Setup: Alice deposits multiple assets
//         vm.startPrank(alice);
//         MockERC20(USDC).approve(address(poolManager), 10_000e6);
//         MockERC20(USDT).approve(address(poolManager), 20_000e6);

//         poolManager.deposit(usdcTokenId, 10_000e6, alice);
//         poolManager.deposit(usdtTokenId, 20_000e6, alice);
//         vm.stopPrank();

//         console2.log("Alice deposited 10k USDC and 20k USDT");

//         // Invest both assets into AAVE (USDT will be swapped to USDC)
//         vm.startPrank(controller);

//         uint256[] memory tokenIds = new uint256[](2);
//         tokenIds[0] = usdcTokenId;
//         tokenIds[1] = usdtTokenId;

//         uint256[] memory percentages = new uint256[](2);
//         percentages[0] = 5000; // 50% of USDC
//         percentages[1] = 4000; // 40% of USDT

//         // Note: In real implementation, USDT would be swapped to USDC
//         // For this test, the mock just accepts it
//         strategyManager.investCrossChain(1, 1, tokenIds, percentages, USDC);

//         console2.log("Invested 50% USDC and 40% USDT into AAVE");

//         // Check allocations
//         CrossChainStrategyManager.AllocationInfo memory allocation = strategyManager.getAllocation(1, USDC);
//         console2.log("Total allocated to AAVE:", allocation.principal);

//         vm.stopPrank();
//     }

//     function test_RiskLimitEnforcement() public {
//         console2.log("=== Risk Limit Enforcement Test ===");

//         // Setup large deposit
//         vm.startPrank(alice);
//         MockERC20(USDC).approve(address(poolManager), 100_000e6);
//         poolManager.deposit(usdcTokenId, 100_000e6, alice);
//         vm.stopPrank();

//         // Try to exceed pool's max allocation limit (80%)
//         vm.startPrank(controller);

//         uint256[] memory tokenIds = new uint256[](1);
//         tokenIds[0] = usdcTokenId;
//         uint256[] memory percentages = new uint256[](1);

//         // First allocation: 70% (should work)
//         percentages[0] = 7000;
//         strategyManager.investCrossChain(1, 1, tokenIds, percentages, USDC);
//         console2.log("Successfully allocated 70% to AAVE");

//         // Try another 20% allocation (total would be 90%, should fail)
//         percentages[0] = 2000;
//         vm.expectRevert(PoolManager.InvalidAllocation.selector);
//         poolManager.allocateToStrategy(usdcTokenId, 20_000e6);
//         console2.log("Correctly prevented allocation exceeding 80% limit");

//         vm.stopPrank();
//     }
// }
