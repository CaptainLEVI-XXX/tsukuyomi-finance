// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestBase, MockStrategyIntegration} from "./Base.t.sol";
import {CrossChainStrategyManager, Client} from "../src/CrossChainStrategyManager.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {console} from "forge-std/console.sol";
import {Test} from "forge-std/Test.sol";


// ============ Mock CCIP Router ============

contract MockCCIPRouter is Test {
    using SafeTransferLib for address;

    uint256 constant FEE = 0.1e18;

    struct MessageData {
        uint64 sourceChain;
        uint64 destChain;
        address receiver;
        bytes data;
        address[] tokens;
        uint256[] amounts;
    }

    mapping(bytes32 => MessageData) private _messages;
    bytes32 public lastMessageId;
    uint256 nonce;

    uint64 constant ETH_CHAIN_SELECTOR = 5009297550715157269;
    uint64 constant BASE_CHAIN_SELECTOR = 15971525489660198786;

    function getMessage(bytes32 messageId) external view returns (MessageData memory) {
        return _messages[messageId];
    }

    function getFee(uint64, Client.EVM2AnyMessage calldata) external pure returns (uint256) {
        return FEE;
    }

    function ccipSend(uint64 destChainSelector, Client.EVM2AnyMessage calldata message) external returns (bytes32) {
        lastMessageId = keccak256(abi.encodePacked(block.timestamp, msg.sender, nonce++));

        console.log("CCIP Send called by:", msg.sender);
        console.log("Destination chain:", destChainSelector);

        address receiver = abi.decode(message.receiver, (address));
        console.log("Message receiver:", receiver);

        // Extract and transfer tokens
        address[] memory tokens = new address[](message.tokenAmounts.length);
        uint256[] memory amounts = new uint256[](message.tokenAmounts.length);

        for (uint256 i = 0; i < message.tokenAmounts.length; i++) {
            tokens[i] = message.tokenAmounts[i].token;
            amounts[i] = message.tokenAmounts[i].amount;
            console.log("Token:", tokens[i], "Amount:", amounts[i]);

            // Transfer tokens to router
            tokens[i].safeTransferFrom(msg.sender, address(this), amounts[i]);
        }

        // Take fee
        if (message.feeToken != address(0)) {
            message.feeToken.safeTransferFrom(msg.sender, address(this), FEE);
        }

        // Store message
        _messages[lastMessageId] = MessageData({
            sourceChain: block.chainid == 1 ? ETH_CHAIN_SELECTOR : BASE_CHAIN_SELECTOR,
            destChain: destChainSelector,
            receiver: receiver,
            data: message.data,
            tokens: tokens,
            amounts: amounts
        });

        console.log("Message stored with ID:", vm.toString(lastMessageId));
        return lastMessageId;
    }

    function deliverMessage(bytes32 messageId, MessageData memory msgData, address target) external {
        console.log("Delivering message:", vm.toString(messageId));
        console.log("Target:", target);
        console.log("Current chain:", block.chainid);

        // Verify target matches expected receiver
        require(msgData.receiver == target, "Target must match message receiver");

        // Map and deal tokens
        for (uint256 i = 0; i < msgData.tokens.length; i++) {
            address token = msgData.tokens[i];

            // Map USDC between chains
            if (block.chainid == 8453 && token == 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48) {
                token = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // BASE_USDC
                console.log("Mapped to Base USDC");
            } else if (block.chainid == 1 && token == 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) {
                token = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; // ETH_USDC
                console.log("Mapped to ETH USDC");
            }

            // Deal tokens to target
            deal(token, target, msgData.amounts[i]);
            // console.log("Dealt", msgData.amounts[i], "of", token, "to", target);

            msgData.tokens[i] = token;
        }

        // Build CCIP message
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](msgData.tokens.length);
        for (uint256 i = 0; i < msgData.tokens.length; i++) {
            tokenAmounts[i] = Client.EVMTokenAmount({token: msgData.tokens[i], amount: msgData.amounts[i]});
        }

        Client.Any2EVMMessage memory ccipMsg = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: msgData.sourceChain,
            sender: abi.encode(address(this)),
            data: msgData.data,
            destTokenAmounts: tokenAmounts
        });

        // Deliver message
        try CrossChainStrategyManager(target).ccipReceive(ccipMsg) {
            console.log(" CCIP message delivered successfully");
        } catch Error(string memory reason) {
            console.log(" CCIP delivery failed:", reason);
            revert(reason);
        } catch (bytes memory lowLevelData) {
            console.log(" CCIP delivery failed with low-level error");
            if (lowLevelData.length >= 4) {
                console.log("Error selector:", vm.toString(bytes4(lowLevelData)));
            }
            revert("CCIP delivery failed");
        }
    }

    function getLastMessageId() external view returns (bytes32) {
        return lastMessageId;
    }
}

/**
 * @title CrossChainTest using CCIP
 * @notice Cross-chain test with separate routers per chain
 */
contract CCIPTest is TestBase {
    using SafeTransferLib for address;

    // Forks
    uint256 public baseFork;

    // Chain selectors
    uint64 constant ETH_CHAIN_SELECTOR = 5009297550715157269;
    uint64 constant BASE_CHAIN_SELECTOR = 15971525489660198786;

    // Chain-specific addresses
    address public LINK_BASE = 0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196;
    address public UNISWAP_ROUTER_BASE = 0x2626664c2603336E57B271c5C0b26F421741e481; // Correct Base Uniswap V3 Router
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Separate routers for each chain
    MockCCIPRouter public ethRouter;
    MockCCIPRouter public baseRouter;

    // Base chain contracts
    CrossChainStrategyManager public baseManager;
    PoolManager public basePool;
    MockStrategyIntegration public baseStrategy;

    // Strategy ID
    uint256 public crossChainStrategyId;

    function setUp() public override {
        super.setUp();

        // Create Base fork
        string memory BASE_RPC = vm.envString("BASE_RPC_URL");
        baseFork = vm.createFork(BASE_RPC);

        // Setup both chains
        _setupEthereumSide();
        _setupBaseSide();
        _registerCrossChainStrategy();

        // Verify setup
        _verifySetup();
    }

    function _setupEthereumSide() internal {
        vm.selectFork(mainnetFork);
        console.log("=== Setting up Ethereum side ===");
        console.log("Chain ID:", block.chainid);

        vm.startPrank(owner);

        // Deploy Ethereum router
        ethRouter = new MockCCIPRouter();
        console.log("Ethereum router deployed at:", address(ethRouter));

        // Deploy and initialize strategy manager
        strategyManager = new CrossChainStrategyManager();
        strategyManager.initialize(owner, controller, address(ethRouter), LINK, ETH_CHAIN_SELECTOR);
        console.log("Ethereum StrategyManager deployed at:", address(strategyManager));

        // Setup pool manager
        strategyManager.addPool(address(poolManager));
        poolManager.updateStrategyManager(address(strategyManager));

        // Fund contracts and users
        deal(LINK, address(strategyManager), 100e18);
        deal(USDC, alice, 100_000e6);

        console.log(" Ethereum setup completed");
        vm.stopPrank();
    }

    function _setupBaseSide() internal {
        vm.selectFork(baseFork);
        console.log("=== Setting up Base side ===");
        console.log("Chain ID:", block.chainid);

        vm.startPrank(owner);

        // Deploy Base router
        baseRouter = new MockCCIPRouter();
        console.log("Base router deployed at:", address(baseRouter));

        // Deploy Base contracts
        baseManager = new CrossChainStrategyManager();
        basePool = new PoolManager();
        baseStrategy = new MockStrategyIntegration(address(baseManager), "Base Strategy");

        console.log("Base Manager deployed at:", address(baseManager));
        console.log("Base Strategy deployed at:", address(baseStrategy));
        console.log("Base Pool deployed at:", address(basePool));

        // Initialize Base manager
        baseManager.initialize(owner, controller, address(baseRouter), LINK_BASE, BASE_CHAIN_SELECTOR);

        // Initialize Base pool (we need a price oracle on Base too)
        // For testing, we'll use a mock address or deploy a simple one
        address basePriceOracle = address(0x1234567890123456789012345678901234567890); // Mock for now
        basePool.initialize(owner, address(baseManager), basePriceOracle);

        // Add chain configurations
        baseManager.addChain(ETH_CHAIN_SELECTOR, address(strategyManager), UNISWAP_ROUTER);
        baseManager.addChain(BASE_CHAIN_SELECTOR, address(baseManager), UNISWAP_ROUTER_BASE);

        // Fund with LINK
        deal(LINK_BASE, address(baseManager), 100e18);

        console.log(" Base setup completed");
        vm.stopPrank();

        // Update Ethereum with Base addresses
        vm.selectFork(mainnetFork);
        vm.prank(owner);
        strategyManager.addChain(BASE_CHAIN_SELECTOR, address(baseManager), UNISWAP_ROUTER_BASE);
        console.log(" Ethereum updated with Base addresses");
    }

    function _registerCrossChainStrategy() internal {
        vm.selectFork(mainnetFork);
        vm.startPrank(owner);

        bytes4[3] memory selectors =
            [baseStrategy.deposit.selector, baseStrategy.withdraw.selector, bytes4(0)];

        crossChainStrategyId =
            strategyManager.registerStrategy("Base Strategy", address(baseStrategy), BASE_CHAIN_SELECTOR, selectors);
        console.log(" Strategy registered on Ethereum with ID:", crossChainStrategyId);

        vm.stopPrank();

        // Register on Base too
        vm.selectFork(baseFork);
        vm.prank(owner);
        baseManager.registerStrategy("Base Strategy", address(baseStrategy), BASE_CHAIN_SELECTOR, selectors);
        console.log(" Strategy registered on Base");
    }

    function _verifySetup() internal {
        // Verify Ethereum
        vm.selectFork(mainnetFork);
        require(address(strategyManager) != address(0), "Ethereum StrategyManager not deployed");
        require(address(ethRouter) != address(0), "Ethereum router not deployed");

        // Verify Base
        vm.selectFork(baseFork);
        require(address(baseManager) != address(0), "Base Manager not deployed");
        require(address(baseStrategy) != address(0), "Base Strategy not deployed");
        require(address(baseRouter) != address(0), "Base router not deployed");

        // Most importantly - verify they're different addresses!
        require(address(baseManager) != address(strategyManager), "Managers should be different!");

        console.log(" Setup verification passed");
    }

    // ============ Tests ============

    function test_CrossChainInvestment() public {
        console.log("=== Cross-Chain Investment Test ===");

        // Step 1: Alice deposits on Ethereum
        vm.selectFork(mainnetFork);
        console.log("Current chain:", block.chainid);

        uint256 depositAmount = 5000e6; // 5,000 USDC
        vm.startPrank(alice);
        USDC.safeApprove(address(poolManager), depositAmount);
        poolManager.deposit(usdcTokenId, depositAmount, alice);
        vm.stopPrank();

        uint256 poolBefore = poolManager.getAvailableLiquidity(usdcTokenId);
        console.log("Pool liquidity before:", poolBefore / 1e6, "USDC");

        // Step 2: Controller invests cross-chain
        vm.startPrank(controller);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = usdcTokenId;
        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 5000; // 50%

        strategyManager.investCrossChain(
            1, // poolId
            crossChainStrategyId,
            tokenIds,
            percentages,
            USDC,
            BASE_USDC
        );

        uint256 poolAfter = poolManager.getAvailableLiquidity(usdcTokenId);
        uint256 invested = poolBefore - poolAfter;
        console.log("Amount invested:", invested / 1e6, "USDC");

        vm.stopPrank();

        // Step 3: Get message from Ethereum router
        bytes32 msgId = ethRouter.getLastMessageId();
        MockCCIPRouter.MessageData memory msgData = ethRouter.getMessage(msgId);

        console.log("Message ID:", vm.toString(msgId));
        console.log("Message receiver:", msgData.receiver);
        console.log("Expected receiver (baseManager):", address(baseManager));

        // CRITICAL: Verify the receiver is correct!
        require(msgData.receiver == address(baseManager), "Message receiver should be baseManager!");

        // Step 4: Deliver message to Base chain
        vm.selectFork(baseFork);
        console.log("Switched to Base chain:", block.chainid);

        // Use Base router to deliver (more realistic)
        baseRouter.deliverMessage(msgId, msgData, address(baseManager));
        console.log("Message delivered to Base manager");

        // Step 5: Verify funds arrived
        uint256 strategyBalance = baseStrategy.getBalance(BASE_USDC);
        console.log("Base strategy balance:", strategyBalance / 1e6, "USDC");
        assertEq(strategyBalance, invested, "Strategy should receive invested funds");

        console.log(" Cross-chain investment test passed!");
    }

    function test_AddressVerification() public {
        console.log("=== Address Verification Test ===");

        // Check Ethereum addresses
        vm.selectFork(mainnetFork);
        console.log("Ethereum chain ID:", block.chainid);
        console.log("Ethereum StrategyManager:", address(strategyManager));
        console.log("Ethereum Router:", address(ethRouter));
        console.log("Price Oracle:", address(priceOracle));

        // Check Base addresses
        vm.selectFork(baseFork);
        console.log("Base chain ID:", block.chainid);
        console.log("Base Manager:", address(baseManager));
        console.log("Base Strategy:", address(baseStrategy));
        console.log("Base Router:", address(baseRouter));

        // Critical assertions
        assertTrue(address(baseManager) != address(strategyManager), "Managers must be different");
        assertTrue(address(baseManager) != address(priceOracle), "Base manager should not be price oracle!");
        assertTrue(address(baseStrategy) != address(0), "Base strategy should exist");
        assertTrue(block.chainid == 8453, "Should be on Base");

        console.log(" Address verification passed!");
    }

    function test_SimpleDeploymentCheck() public {
        console.log("=== Simple Deployment Check ===");

        // Check Base deployment specifically
        vm.selectFork(baseFork);

        console.log("Base Manager address:", address(baseManager));
        console.log("Base Manager code length:", address(baseManager).code.length);
        console.log("Base Strategy address:", address(baseStrategy));
        console.log("Base Strategy code length:", address(baseStrategy).code.length);

        // Verify they're deployed
        assertTrue(address(baseManager).code.length > 0, "Base manager should have code");
        assertTrue(address(baseStrategy).code.length > 0, "Base strategy should have code");

        // Try a simple call to verify they work
        string memory strategyName = baseStrategy.name();
        console.log("Strategy name:", strategyName);
        assertEq(strategyName, "Base Strategy", "Strategy should have correct name");

        console.log(" Deployment check passed!");
    }
}
