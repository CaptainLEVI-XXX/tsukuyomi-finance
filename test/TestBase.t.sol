// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";

import {PoolManager} from "../src/PoolManager.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

// Import interfaces
import {IStrategyIntegration} from "../src/interfaces/IStrategyIntegration.sol";
import {Client} from "../src/interfaces/ICCIP.sol";

contract TestBase is Test {
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
    PriceOracle public priceOracle;
    
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
    address public constant LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
    
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
        
        // Label addresses for better traces
        vm.label(owner, "Owner");
        vm.label(controller, "Controller");
        vm.label(alice, "Alice");
        vm.label(bob, "Bob");
        vm.label(USDC, "USDC");
        vm.label(USDT, "USDT");
        vm.label(DAI, "DAI");
        
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
        priceOracle = new PriceOracle();
        
        // Deploy core contracts
        poolManager = new PoolManager();
        strategyManager = new CrossChainStrategyManager();
        
        // Deploy mock integrations
        aaveIntegration = new MockStrategyIntegration(address(strategyManager), "AAVE V3");
        morphoIntegration = new MockStrategyIntegration(address(strategyManager), "Morpho Blue");
        
        // Initialize contracts
        poolManager.initialize(
            owner,
            address(strategyManager),
            address(priceOracle)
        );
        
        strategyManager.initialize(
            owner,
            controller,
            CCIP_ROUTER,
            LINK,
            mainnetChainSelector
        );
        
        // Setup chain info
        strategyManager.addChain(
            mainnetChainSelector,
            address(strategyManager),
            UNISWAP_ROUTER
        );
        
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
        priceOracle.setPrice(USDC, 100000000); // $1.00
        priceOracle.setPrice(USDT, 100000000); // $1.00
        priceOracle.setPrice(DAI, 100000000);  // $1.00
        
        vm.stopPrank();
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
            "AAVE V3 Strategy",
            address(aaveIntegration),
            mainnetChainSelector,
            aaveSelectors
        );
        
        bytes4[4] memory morphoSelectors = [
            morphoIntegration.deposit.selector,
            morphoIntegration.withdraw.selector,
            morphoIntegration.harvest.selector,
            morphoIntegration.getBalance.selector
        ];
        
        strategyManager.registerStrategy(
            "Morpho Blue Strategy",
            address(morphoIntegration),
            mainnetChainSelector,
            morphoSelectors
        );
        
        vm.stopPrank();
    }
    
    // Helper functions
    function _dealTokens(address token, address to, uint256 amount) internal {
        deal(token, to, amount, true); // true = update totalSupply
    }
    
    function _approveToken(address token, address spender, uint256 amount) internal {
        vm.prank(msg.sender);
        MockERC20(token).approve(spender, amount);
    }
    
    function _getTokenBalance(address token, address account) internal view returns (uint256) {
        return MockERC20(token).balanceOf(account);
    }
}

// Mock Strategy Integration for testing
contract MockStrategyIntegration is IStrategyIntegration {
    address public immutable strategyManager;
    string public name;
    
    mapping(address => uint256) public balances;
    mapping(address => uint256) public yields;
    
    constructor(address _strategyManager, string memory _name) {
        strategyManager = _strategyManager;
        name = _name;
    }
    
    function deposit(uint256 amount) external returns (bool) {
        require(msg.sender == strategyManager, "Only strategy manager");
        // For testing, assume we're depositing USDC
        address asset = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; // USDC
        
        MockERC20(asset).transferFrom(strategyManager, address(this), amount);
        balances[asset] += amount;
        
        return true;
    }
    
    function withdraw(uint256 amount, address asset) external returns (uint256) {
        require(msg.sender == strategyManager, "Only strategy manager");
        
        uint256 toWithdraw = amount > balances[asset] ? balances[asset] : amount;
        if (toWithdraw > 0) {
            balances[asset] -= toWithdraw;
            MockERC20(asset).transfer(strategyManager, toWithdraw);
        }
        
        return toWithdraw;
    }
    
    function harvest(address asset) external returns (uint256) {
        require(msg.sender == strategyManager, "Only strategy manager");
        
        uint256 yield = yields[asset];
        if (yield > 0) {
            yields[asset] = 0;
            MockERC20(asset).transfer(strategyManager, yield);
        }
        
        return yield;
    }
    
    function getBalance(address asset) external view returns (uint256) {
        return balances[asset];
    }
    
    function getExpectedYield(address asset) external view returns (uint256) {
        return yields[asset];
    }
    
    function emergencyWithdraw() external returns (uint256) {
        // Emergency withdrawal logic
        return 0;
    }
    
    // Test helper to simulate yield generation
    function generateYield(address asset, uint256 amount) external {
        yields[asset] += amount;
        deal(asset, address(this), MockERC20(asset).balanceOf(address(this)) + amount, true);
    }
}

// Simple Price Oracle for testing
contract PriceOracle {
    mapping(address => uint256) public prices; // Price in USD with 8 decimals
    
    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }
    
    function getPrice(address asset) external view returns (uint256 price, uint8 decimals) {
        price = prices[asset];
        decimals = 8;
    }
    
    function getPriceInUSD(address asset) external view returns (uint256) {
        return prices[asset];
    }
}

// Mock ERC20 interface
interface MockERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}