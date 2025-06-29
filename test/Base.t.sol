// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {PoolManager} from "../src/PoolManager.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {ChainlinkPriceOracle} from "../src/PriceOracle.sol";

// Import interfaces
import {IStrategyIntegration} from "../src/interfaces/IStrategyIntegration.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {MockStrategyIntegration} from "./mocks/MockStrategyIntegration.sol";

/**
 * @title TestBase
 * @notice Base test contract with common setup for all protocol tests
 */
contract TestBase is Test {
    using SafeTransferLib for address;

    // ============ Test Accounts ============
    address public owner = makeAddr("Owner");
    address public controller = makeAddr("Controller");
    address public alice = makeAddr("Alice");
    address public bob = makeAddr("Bob");

    // ============ Chain Configuration ============
    uint64 public constant MAINNET_CHAIN_SELECTOR = 5009297550715157269; // Ethereum mainnet

    // ============ Core Protocol Contracts ============
    PoolManager public poolManager;
    CrossChainStrategyManager public strategyManager;
    ChainlinkPriceOracle public priceOracle;

    // ============ Mock Strategy Integrations ============
    MockStrategyIntegration public aaveIntegration;
    MockStrategyIntegration public morphoIntegration;

    // ============ Fork Configuration ============
    uint256 public mainnetFork;

    // ============ Mainnet Token Addresses ============
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    // ============ Protocol Integration Addresses ============
    address public constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address public constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address public constant UNISWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    // ============ CCIP Infrastructure ============
    address public constant CCIP_ROUTER = 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D;

    // ============ Token IDs in PoolManager ============
    uint256 public usdcTokenId;
    uint256 public usdtTokenId;
    uint256 public daiTokenId;

    // ============ Strategy IDs ============
    uint256 public constant AAVE_STRATEGY_ID = 1;
    uint256 public constant MORPHO_STRATEGY_ID = 2;

    function setUp() public virtual {
        _setupFork();
        _fundTestAccounts();
        _deployProtocolContracts();
        _setupTokens();
        _setupStrategies();
        _logSetupCompletion();
    }

    // ============ Setup Functions ============

    function _setupFork() internal {
        string memory MAINNET_RPC = vm.envString("MAINNET_RPC_URL");
        mainnetFork = vm.createFork(MAINNET_RPC);
        vm.selectFork(mainnetFork);
    }

    function _fundTestAccounts() internal {
        vm.deal(owner, 100 ether);
        vm.deal(controller, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _deployProtocolContracts() internal {
        vm.startPrank(owner);

        // Deploy price oracle first
        priceOracle = new ChainlinkPriceOracle(owner);

        // Deploy core contracts
        poolManager = new PoolManager();
        strategyManager = new CrossChainStrategyManager();

        // Deploy mock strategy integrations
        aaveIntegration = new MockStrategyIntegration(address(strategyManager), "AAVE V3");
        morphoIntegration = new MockStrategyIntegration(address(strategyManager), "Morpho Blue");

        // Initialize core contracts
        poolManager.initialize(owner, address(strategyManager), address(priceOracle));
        strategyManager.initialize(owner, controller, CCIP_ROUTER, LINK, MAINNET_CHAIN_SELECTOR);

        // Setup chain configuration
        strategyManager.addChain(MAINNET_CHAIN_SELECTOR, address(strategyManager), UNISWAP_ROUTER);

        // Register pool with strategy manager
        strategyManager.addPool(address(poolManager));

        vm.stopPrank();
    }

    function _setupTokens() internal {
        vm.startPrank(owner);

        // Add supported assets to pool manager
        usdcTokenId = poolManager.addAsset(USDC, "Pool USDC", "pUSDC");
        usdtTokenId = poolManager.addAsset(USDT, "Pool USDT", "pUSDT");
        daiTokenId = poolManager.addAsset(DAI, "Pool DAI", "pDAI");

        // Configure price oracle
        _configurePriceOracle();

        vm.stopPrank();
    }

    function _setupStrategies() internal {
        vm.startPrank(owner);

        // Register AAVE strategy
        bytes4[3] memory aaveSelectors = [
            aaveIntegration.deposit.selector,
            aaveIntegration.withdraw.selector,
            aaveIntegration.getBalance.selector
        ];

        strategyManager.registerStrategy(
            "AAVE V3 Strategy", 
            address(aaveIntegration), 
            MAINNET_CHAIN_SELECTOR, 
            aaveSelectors
        );

        // Register Morpho strategy
        bytes4[3] memory morphoSelectors = [
            morphoIntegration.deposit.selector,
            morphoIntegration.withdraw.selector,
            morphoIntegration.getBalance.selector
        ];

        strategyManager.registerStrategy(
            "Morpho Blue Strategy", 
            address(morphoIntegration), 
            MAINNET_CHAIN_SELECTOR, 
            morphoSelectors
        );

        vm.stopPrank();
    }

    function _configurePriceOracle() internal {
        // Add Chainlink price feeds for supported assets
        priceOracle.addPriceFeed(USDC, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600);
        priceOracle.addPriceFeed(USDT, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600); 
        priceOracle.addPriceFeed(DAI, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600);
    }

    function _logSetupCompletion() internal view {
        console.log("=== Protocol Setup Complete ===");
        console.log("Chain ID:", block.chainid);
        console.log("PoolManager:", address(poolManager));
        console.log("StrategyManager:", address(strategyManager));
        console.log("PriceOracle:", address(priceOracle));
        console.log("AAVE Integration:", address(aaveIntegration));
        console.log("Morpho Integration:", address(morphoIntegration));
    }

    // ============ Helper Functions ============

    /**
     * @notice Deal tokens to an address and update total supply
     */
    function dealTokens(address token, address to, uint256 amount) internal {
        deal(token, to, amount, true);
    }

    /**
     * @notice Approve token spending for the current message sender
     */
    function approveToken(address token, address spender, uint256 amount) internal {
        vm.prank(msg.sender);
        token.safeApprove(spender, amount);
    }

    /**
     * @notice Get token balance for an account
     */
    function getTokenBalance(address token, address account) internal view returns (uint256) {
        return token.balanceOf(account);
    }

    /**
     * @notice Fund user with multiple tokens for testing
     */
    function fundUserWithTokens(address user, uint256 amount) internal {
        dealTokens(USDC, user, amount);
        dealTokens(USDT, user, amount);
        dealTokens(DAI, user, amount * 1e12); // DAI has 18 decimals
    }

    /**
     * @notice Setup a user with tokens and pool deposits
     */
    function setupUserWithDeposits(address user, uint256 amount) internal {
        fundUserWithTokens(user, amount);
        
        vm.startPrank(user);
        USDC.safeApprove(address(poolManager), amount);
        USDT.safeApprove(address(poolManager), amount);
        DAI.safeApprove(address(poolManager), amount * 1e12);

        poolManager.deposit(usdcTokenId, amount, user);
        poolManager.deposit(usdtTokenId, amount, user);
        poolManager.deposit(daiTokenId, amount * 1e12, user);
        vm.stopPrank();
    }

    /**
     * @notice Get total pool value across all assets
     */
    function getTotalPoolValue() internal view returns (uint256) {
        uint256 usdcValue = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 usdtValue = poolManager.getAvailableLiquidity(usdtTokenId);
        uint256 daiValue = poolManager.getAvailableLiquidity(daiTokenId);
        
        // Convert all to USDC equivalent (simplified)
        return usdcValue + usdtValue + (daiValue / 1e12);
    }

    /**
     * @notice Assert token balances for testing
     */
    function assertTokenBalance(
        address token, 
        address account, 
        uint256 expectedBalance,
        string memory message
    ) internal {
        uint256 actualBalance = getTokenBalance(token, account);
        assertEq(actualBalance, expectedBalance, message);
    }

    /**
     * @notice Create investment parameters for testing
     */
    function createInvestmentParams(uint256 tokenId, uint256 percentage) 
        internal 
        pure 
        returns (uint256[] memory tokenIds, uint256[] memory percentages) 
    {
        tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        percentages = new uint256[](1);
        percentages[0] = percentage;
    }

    /**
     * @notice Log current state for debugging
     */
    function logCurrentState() internal view {
        console.log("=== Current State ===");
        console.log("Block timestamp:", block.timestamp);
        console.log("Block number:", block.number);
        console.log("Chain ID:", block.chainid);
        console.log("USDC Pool Liquidity:", poolManager.getAvailableLiquidity(usdcTokenId));
        console.log("USDT Pool Liquidity:", poolManager.getAvailableLiquidity(usdtTokenId));
        console.log("DAI Pool Liquidity:", poolManager.getAvailableLiquidity(daiTokenId));
    }
}