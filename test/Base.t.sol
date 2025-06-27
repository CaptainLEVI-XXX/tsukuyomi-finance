// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {PoolManager} from "../src/PoolManager.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {ChainlinkPriceOracle} from "../src/PriceOracle.sol";
// import {MockERC20} from "./mocks/MockERC20.sol";

// Import interfaces
import {IStrategyIntegration} from "../src/interfaces/IStrategyIntegration.sol";
// import {Client} from "../src/interfaces/ICCIP.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {MockStrategyIntegration} from "./mocks/MockStrategyIntegration.sol";

contract TestBase is Test {
    using SafeTransferLib for address;
    // Test addresses

    address public owner = makeAddr("Owner");
    address public controller = makeAddr("Controller");
    address public alice = makeAddr("Alice");
    address public bob = makeAddr("Bob");

    // Chain selectors
    uint64 public mainnetChainSelector = 5009297550715157269; // Ethereum mainnet
    uint64 public baseChainSelector = 15971525489660198786; // Base mainnet

    // Core contracts
    PoolManager public poolManager;
    CrossChainStrategyManager public strategyManager;
    ChainlinkPriceOracle public priceOracle;

    // Mock integrations for testing
    MockStrategyIntegration public aaveIntegration;
    MockStrategyIntegration public morphoIntegration;

    // Fork configuration
    uint256 public mainnetFork;

    // Token addresses on mainnet
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant LINK =0x514910771AF9Ca656af840dff83E8264EcF986CA;

    // Protocol addresses
    address public constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address public constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address public constant UNISWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    // CCIP addresses (mainnet)
    address public constant CCIP_ROUTER = 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D;

    // Token IDs in PoolManager
    uint256 public usdcTokenId;
    uint256 public usdtTokenId;
    uint256 public daiTokenId;

    function setUp() public virtual {
        // Create mainnet fork
        string memory MAINNET_RPC = vm.envString("MAINNET_RPC_URL");
        mainnetFork = vm.createFork(MAINNET_RPC);
        vm.selectFork(mainnetFork);

        // Fund test accounts
        vm.deal(owner, 100 ether);
        vm.deal(controller, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Deploy and setup
        _deployContracts();
        _setupTokens();
        _setupStrategies();
    }

    function _deployContracts() internal {
        vm.startPrank(owner);

        // Deploy price oracle
        priceOracle = new ChainlinkPriceOracle(owner);

        // Deploy core contracts
        poolManager = new PoolManager();
        strategyManager = new CrossChainStrategyManager();

        // Deploy mock integrations
        aaveIntegration = new MockStrategyIntegration(address(strategyManager), "AAVE V3");
        morphoIntegration = new MockStrategyIntegration(address(strategyManager), "Morpho Blue");

        // Initialize contracts
        poolManager.initialize(owner, address(strategyManager), address(priceOracle));

        strategyManager.initialize(owner, controller, CCIP_ROUTER, LINK, mainnetChainSelector);

        // Setup chain info
        strategyManager.addChain(mainnetChainSelector, address(strategyManager), UNISWAP_ROUTER);

        // Add pool to strategy manager
        uint256 poolId = strategyManager.addPool(address(poolManager));

        vm.stopPrank();
    }

    function _setupTokens() internal {
        vm.startPrank(owner);

        // Add assets to pool manager
        usdcTokenId = poolManager.addAsset(USDC, "Pool USDC", "pUSDC");
        usdtTokenId = poolManager.addAsset(USDT, "Pool USDT", "pUSDT");
        daiTokenId = poolManager.addAsset(DAI, "Pool DAI", "pDAI");

        // Set mock prices in oracle (prices in USD with 8 decimals)
        vm.stopPrank();
        _setUpPriceOracle();
    }

    function _setupStrategies() internal {
        vm.startPrank(owner);

        // Register strategies with proper selectors
        bytes4[4] memory aaveSelectors = [
            aaveIntegration.deposit.selector,
            aaveIntegration.withdraw.selector,
            aaveIntegration.harvest.selector,
            aaveIntegration.getBalance.selector
        ];

        strategyManager.registerStrategy(
            "AAVE V3 Strategy", address(aaveIntegration), mainnetChainSelector, aaveSelectors
        );

        bytes4[4] memory morphoSelectors = [
            morphoIntegration.deposit.selector,
            morphoIntegration.withdraw.selector,
            morphoIntegration.harvest.selector,
            morphoIntegration.getBalance.selector
        ];

        strategyManager.registerStrategy(
            "Morpho Blue Strategy", address(morphoIntegration), mainnetChainSelector, morphoSelectors
        );

        vm.stopPrank();
    }

    function _setUpPriceOracle() internal {
        vm.startPrank(owner);

        // Add price feeds
        priceOracle.addPriceFeed(USDC, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600); // Chainlink USDC/USD
        priceOracle.addPriceFeed(USDT, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600); // Chainlink USDT/USD
        priceOracle.addPriceFeed(DAI, 0x8A753747a1fa494Ec906ce904320610a49a0A053, 3600); // Chainlink DAI/USD

        vm.stopPrank();
    }

    // Helper functions
    function _dealTokens(address token, address to, uint256 amount) internal {
        deal(token, to, amount, true); // true = update totalSupply
    }

    function _approveToken(address token, address spender, uint256 amount) internal {
        vm.prank(msg.sender);
        token.safeApprove(spender, amount);
    }

    function _getTokenBalance(address token, address account) internal view returns (uint256) {
        return token.balanceOf(account);
    }
}



