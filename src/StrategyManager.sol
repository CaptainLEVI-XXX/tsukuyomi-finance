// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {ReentrancyGuard} from "@solady/utils/ReentrancyGuard.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPoolManager} from "./interfaces/IPoolManager.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

// CCIP Imports
import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {LinkTokenInterface} from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

/**
 * @title Enhanced Cross-Chain Strategy Manager with CCIP
 * @dev Manages investment strategies across multiple DApps, AMMs, and blockchains using Chainlink CCIP
 */
contract EnhancedStrategyManager is 
    UUPSUpgradeable, 
    Ownable,
    Initializable,
    ReentrancyGuard,
    CCIPReceiver
{
    // ============ Enums ============
    
    enum ProtocolType {
        DEX,           // Uniswap, SushiSwap, etc.
        LENDING,       // Aave, Compound, etc.
        LIQUID_STAKING, // Lido, RocketPool, etc.
        YIELD_FARMING, // Curve, Convex, etc.
        DERIVATIVES,   // GMX, dYdX, etc.
        BRIDGE,        // Cross-chain protocols
        OTHER
    }
    
    enum InvestmentStatus {
        PENDING,
        ACTIVE,
        PAUSED,
        WITHDRAWN,
        LIQUIDATED,
        CROSS_CHAIN_PENDING
    }
    
    enum ChainStatus {
        ACTIVE,
        PAUSED,
        MAINTENANCE
    }
    
    enum MessageType {
        INVEST,
        WITHDRAW,
        REBALANCE,
        EMERGENCY_WITHDRAW
    }
    
    // ============ Structs ============
    
    struct ProtocolInfo {
        string name;
        address protocolAddress;
        ProtocolType protocolType;
        uint64 chainId; // CCIP uses uint64 for chain selectors
        bool isActive;
        uint256 totalInvested;
        uint256 totalReturned;
        uint256 riskLevel; // 1-10 scale
        bytes32 protocolId; // Unique identifier
        uint256 maxInvestment; // Maximum allowed investment
        uint256 minInvestment; // Minimum required investment
    }
    
    struct StrategyInfo {
        string name;
        address strategyAddress;
        bytes4 depositSelector;
        bytes4 withdrawSelector;
        bytes32[] allowedProtocols;
        uint64[] allowedChains;
        bool isRegistered;
        uint256 totalAllocated;
        uint256 maxAllocation;
        uint256 riskScore;
        bool crossChainEnabled;
    }
    
    struct Investment {
        bytes32 protocolId;
        uint256 strategyId;
        address asset;
        uint256 amount;
        uint256 timestamp;
        uint64 chainId;
        InvestmentStatus status;
        uint256 expectedYield;
        uint256 actualYield;
        bytes32 ccipMessageId; // CCIP message ID for cross-chain tracking
        address investor; // Original investor
    }
    
    struct CrossChainInvestment {
        uint64 sourceChain;
        uint64 targetChain;
        address sourceAsset;
        address targetAsset;
        uint256 amount;
        bytes32 protocolId;
        uint256 strategyId;
        MessageType messageType;
        address recipient;
        bytes32 messageId;
        bool completed;
        uint256 timestamp;
    }
    
    struct ChainInfo {
        uint64 chainSelector; // CCIP chain selector
        string name;
        address strategyManager; // Strategy manager on that chain
        ChainStatus status;
        bool isSupported;
        uint256 gasLimit;
        address linkToken;
    }
    
    struct DepositedInfo {
        uint256 amount;
        address asset;
        uint256 timestamp;
        uint256[] amounts;
        address[] assets;
        uint64 chainId;
        bytes32 ccipMessageId;
    }
    
    // ============ State Variables ============
    
    // Core state
    mapping(uint256 => StrategyInfo) public strategyInfo;
    mapping(uint256 => address) public poolInfo;
    mapping(bytes32 => ProtocolInfo) public protocolInfo;
    mapping(uint64 => ChainInfo) public chainInfo;
    
    // Investment tracking
    mapping(uint256 => Investment) public investments;
    mapping(bytes32 => CrossChainInvestment) public crossChainInvestments;
    mapping(uint256 => DepositedInfo) public depositedInfo;
    
    // Protocol tracking by chain and type
    mapping(uint64 => mapping(ProtocolType => bytes32[])) public protocolsByChainAndType;
    mapping(bytes32 => mapping(uint64 => uint256)) public protocolInvestmentByChain;
    
    // Cross-chain message tracking
    mapping(bytes32 => bool) public processedMessages;
    mapping(address => bool) public authorizedSenders;
    
    // Counters
    uint256 public depositId;
    uint256 public nextStrategyId;
    uint256 public nextInvestmentId;
    uint256 public totalRegisteredStrategies;
    uint256 public nextPoolId;
    
    // Protocol addresses
    address public elizia; // Protocol controller address
    address public uniswapRouter;
    LinkTokenInterface public linkToken;
    
    // Cross-chain settings
    uint256 public ccipGasLimit = 500000;
    mapping(uint64 => bool) public allowedSourceChains;
    mapping(uint64 => bool) public allowedDestinationChains;
    
    // ============ Constants ============
    
    uint256 public constant MAX_RISK_LEVEL = 10;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_PROTOCOLS_PER_CHAIN = 50;
    
    // ============ Events ============
    
    event StrategyRegistered(
        string indexed name,
        uint256 indexed strategyId,
        address indexed strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector,
        bool crossChainEnabled
    );
    
    event ProtocolRegistered(
        bytes32 indexed protocolId,
        string name,
        address protocolAddress,
        ProtocolType protocolType,
        uint64 chainId
    );
    
    event InvestmentMade(
        uint256 indexed investmentId,
        bytes32 indexed protocolId,
        uint256 indexed strategyId,
        address asset,
        uint256 amount,
        uint64 chainId,
        bytes32 ccipMessageId
    );
    
    event CrossChainInvestmentInitiated(
        uint64 indexed sourceChain,
        uint64 indexed targetChain,
        bytes32 indexed messageId,
        address asset,
        uint256 amount,
        bytes32 protocolId
    );
    
    event CrossChainInvestmentCompleted(
        bytes32 indexed messageId,
        uint256 indexed investmentId,
        uint256 amountInvested
    );
    
    event CCIPMessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        MessageType messageType
    );
    
    event ChainAdded(
        uint64 indexed chainSelector,
        string name,
        address strategyManager
    );
    
    event EmergencyWithdrawal(
        uint256 indexed investmentId,
        bytes32 indexed protocolId,
        uint256 amount,
        address recipient
    );
    
    // ============ Errors ============
    
    error InvalidStrategy();
    error StrategyNotFound();
    error ProtocolNotFound();
    error ChainNotSupported();
    error InsufficientLinkBalance();
    error UnauthorizedSender();
    error MessageAlreadyProcessed();
    error InvestmentNotFound();
    error ExceedsMaxInvestment();
    error BelowMinInvestment();
    error InvalidRiskLevel();
    error CrossChainDisabled();
    error InvalidChainSelector();
    error InsufficientBalance();
    error ZeroAddress();
    error ArrayLengthMismatch();
    error StrategyCallFailed();
    error CCIPError(string reason);
    
    // ============ Modifiers ============
    
    modifier onlyEliziaOrOwner() {
        if (msg.sender != elizia && msg.sender != owner()) {
            revert UnauthorizedSender();
        }
        _;
    }
    
    modifier validChain(uint64 chainSelector) {
        if (!chainInfo[chainSelector].isSupported) {
            revert ChainNotSupported();
        }
        _;
    }
    
    modifier validStrategy(uint256 strategyId) {
        if (!strategyInfo[strategyId].isRegistered) {
            revert StrategyNotFound();
        }
        _;
    }
    
    modifier validProtocol(bytes32 protocolId) {
        if (!protocolInfo[protocolId].isActive) {
            revert ProtocolNotFound();
        }
        _;
    }
    
    // ============ Initialization ============
    
    function initialize(
        address _elizia,
        address _owner,
        address _uniswapRouter,
        address _ccipRouter,
        address _linkToken
    ) public initializer {
        if (_elizia == address(0) || _owner == address(0) || 
            _uniswapRouter == address(0) || _ccipRouter == address(0) || 
            _linkToken == address(0)) {
            revert ZeroAddress();
        }
        
        _initializeOwner(_owner);
        CCIPReceiver.__ccipReceive(_ccipRouter);
        
        // Initialize state variables
        elizia = _elizia;
        uniswapRouter = _uniswapRouter;
        linkToken = LinkTokenInterface(_linkToken);
        
        // Initialize counters
        nextStrategyId = 1;
        nextPoolId = 1;
        nextInvestmentId = 1;
        depositId = 0;
        totalRegisteredStrategies = 0;
    }
    
    // ============ Chain Management ============
    
    function addSupportedChain(
        uint64 chainSelector,
        string memory name,
        address strategyManager,
        uint256 gasLimit,
        address chainLinkToken
    ) external onlyOwner {
        chainInfo[chainSelector] = ChainInfo({
            chainSelector: chainSelector,
            name: name,
            strategyManager: strategyManager,
            status: ChainStatus.ACTIVE,
            isSupported: true,
            gasLimit: gasLimit,
            linkToken: chainLinkToken
        });
        
        allowedSourceChains[chainSelector] = true;
        allowedDestinationChains[chainSelector] = true;
        
        emit ChainAdded(chainSelector, name, strategyManager);
    }
    
    function updateChainStatus(uint64 chainSelector, ChainStatus status) external onlyOwner {
        chainInfo[chainSelector].status = status;
    }
    
    // ============ Protocol Management ============
    
    function registerProtocol(
        string memory name,
        address protocolAddress,
        ProtocolType protocolType,
        uint64 chainId,
        uint256 riskLevel,
        uint256 maxInvestment,
        uint256 minInvestment
    ) external onlyOwner returns (bytes32 protocolId) {
        if (riskLevel > MAX_RISK_LEVEL) revert InvalidRiskLevel();
        if (!chainInfo[chainId].isSupported) revert ChainNotSupported();
        
        protocolId = keccak256(abi.encodePacked(name, protocolAddress, chainId));
        
        protocolInfo[protocolId] = ProtocolInfo({
            name: name,
            protocolAddress: protocolAddress,
            protocolType: protocolType,
            chainId: chainId,
            isActive: true,
            totalInvested: 0,
            totalReturned: 0,
            riskLevel: riskLevel,
            protocolId: protocolId,
            maxInvestment: maxInvestment,
            minInvestment: minInvestment
        });
        
        // Add to chain-type mapping
        protocolsByChainAndType[chainId][protocolType].push(protocolId);
        
        emit ProtocolRegistered(protocolId, name, protocolAddress, protocolType, chainId);
        
        return protocolId;
    }
    
    // ============ Strategy Management ============
    
    function addStrategy(
        string memory name,
        address strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector,
        bytes32[] memory allowedProtocols,
        uint64[] memory allowedChains,
        uint256 maxAllocation,
        uint256 riskScore,
        bool crossChainEnabled
    ) external onlyOwner nonReentrant returns (uint256) {
        if (strategyAddress == address(0)) revert InvalidStrategy();
        
        uint256 strategyId = nextStrategyId;
        
        StrategyInfo storage strategy = strategyInfo[strategyId];
        strategy.name = name;
        strategy.strategyAddress = strategyAddress;
        strategy.depositSelector = depositSelector;
        strategy.withdrawSelector = withdrawSelector;
        strategy.allowedProtocols = allowedProtocols;
        strategy.allowedChains = allowedChains;
        strategy.isRegistered = true;
        strategy.totalAllocated = 0;
        strategy.maxAllocation = maxAllocation;
        strategy.riskScore = riskScore;
        strategy.crossChainEnabled = crossChainEnabled;
        
        nextStrategyId++;
        totalRegisteredStrategies++;
        
        emit StrategyRegistered(
            name,
            strategyId,
            strategyAddress,
            depositSelector,
            withdrawSelector,
            crossChainEnabled
        );
        
        return strategyId;
    }
    
    // ============ Cross-Chain Investment Functions ============
    
    function investCrossChain(
        uint64 targetChain,
        bytes32 protocolId,
        uint256 strategyId,
        address asset,
        uint256 amount,
        address targetAsset
    ) external payable onlyEliziaOrOwner validChain(targetChain) validStrategy(strategyId) validProtocol(protocolId) returns (bytes32 messageId) {
        StrategyInfo memory strategy = strategyInfo[strategyId];
        
        if (!strategy.crossChainEnabled) revert CrossChainDisabled();
        
        // Validate protocol is on target chain
        if (protocolInfo[protocolId].chainId != targetChain) revert ProtocolNotFound();
        
        // Check investment limits
        if (amount > protocolInfo[protocolId].maxInvestment) revert ExceedsMaxInvestment();
        if (amount < protocolInfo[protocolId].minInvestment) revert BelowMinInvestment();
        
        // Transfer tokens to this contract
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        
        // Prepare CCIP message
        Client.EVM2AnyMessage memory message = _buildCCIPMessage(
            targetChain,
            asset,
            targetAsset,
            amount,
            protocolId,
            strategyId,
            MessageType.INVEST,
            msg.sender
        );
        
        // Calculate CCIP fees
        uint256 fees = IRouterClient(i_router).getFee(targetChain, message);
        if (address(linkToken).balance < fees) revert InsufficientLinkBalance();
        
        // Approve LINK tokens for fees
        linkToken.approve(address(i_router), fees);
        
        // Send CCIP message
        messageId = IRouterClient(i_router).ccipSend(targetChain, message);
        
        // Store cross-chain investment
        crossChainInvestments[messageId] = CrossChainInvestment({
            sourceChain: uint64(block.chainid),
            targetChain: targetChain,
            sourceAsset: asset,
            targetAsset: targetAsset,
            amount: amount,
            protocolId: protocolId,
            strategyId: strategyId,
            messageType: MessageType.INVEST,
            recipient: msg.sender,
            messageId: messageId,
            completed: false,
            timestamp: block.timestamp
        });
        
        emit CrossChainInvestmentInitiated(
            uint64(block.chainid),
            targetChain,
            messageId,
            asset,
            amount,
            protocolId
        );
        
        return messageId;
    }
    
    function withdrawCrossChain(
        uint256 investmentId,
        uint64 targetChain,
        address recipient
    ) external payable onlyEliziaOrOwner returns (bytes32 messageId) {
        Investment storage investment = investments[investmentId];
        if (investment.investor != msg.sender && msg.sender != owner()) revert UnauthorizedSender();
        if (investment.status != InvestmentStatus.ACTIVE) revert InvestmentNotFound();
        
        // Prepare withdrawal message
        Client.EVM2AnyMessage memory message = _buildWithdrawMessage(
            targetChain,
            investmentId,
            recipient
        );
        
        // Calculate and pay fees
        uint256 fees = IRouterClient(i_router).getFee(targetChain, message);
        if (address(linkToken).balance < fees) revert InsufficientLinkBalance();
        
        linkToken.approve(address(i_router), fees);
        
        // Send CCIP message
        messageId = IRouterClient(i_router).ccipSend(targetChain, message);
        
        // Update investment status
        investment.status = InvestmentStatus.CROSS_CHAIN_PENDING;
        investment.ccipMessageId = messageId;
        
        return messageId;
    }
    
    // ============ CCIP Message Handling ============
    
    function _ccipReceive(
        Client.Any2EVMMessage memory any2EvmMessage
    ) internal override {
        bytes32 messageId = any2EvmMessage.messageId;
        uint64 sourceChainSelector = any2EvmMessage.sourceChainSelector;
        
        // Prevent duplicate processing
        if (processedMessages[messageId]) revert MessageAlreadyProcessed();
        processedMessages[messageId] = true;
        
        // Verify sender authorization
        if (!authorizedSenders[abi.decode(any2EvmMessage.sender, (address))]) {
            revert UnauthorizedSender();
        }
        
        // Decode message
        (MessageType messageType, bytes memory data) = abi.decode(any2EvmMessage.data, (MessageType, bytes));
        
        if (messageType == MessageType.INVEST) {
            _handleCrossChainInvestment(messageId, sourceChainSelector, data, any2EvmMessage.destTokenAmounts);
        } else if (messageType == MessageType.WITHDRAW) {
            _handleCrossChainWithdrawal(messageId, sourceChainSelector, data);
        }
        
        emit CCIPMessageReceived(messageId, sourceChainSelector, abi.decode(any2EvmMessage.sender, (address)), messageType);
    }
    
    function _handleCrossChainInvestment(
        bytes32 messageId,
        uint64 sourceChain,
        bytes memory data,
        Client.EVMTokenAmount[] memory tokenAmounts
    ) internal {
        (
            bytes32 protocolId,
            uint256 strategyId,
            address targetAsset,
            address investor
        ) = abi.decode(data, (bytes32, uint256, address, address));
        
        if (tokenAmounts.length == 0) return;
        
        uint256 amount = tokenAmounts[0].amount;
        
        // Execute investment
        uint256 investmentId = _executeInvestment(
            protocolId,
            strategyId,
            targetAsset,
            amount,
            investor,
            messageId
        );
        
        // Mark cross-chain investment as completed
        if (crossChainInvestments[messageId].messageId == messageId) {
            crossChainInvestments[messageId].completed = true;
        }
        
        emit CrossChainInvestmentCompleted(messageId, investmentId, amount);
    }
    
    function _handleCrossChainWithdrawal(
        bytes32 messageId,
        uint64 sourceChain,
        bytes memory data
    ) internal {
        (uint256 investmentId, address recipient) = abi.decode(data, (uint256, address));
        
        Investment storage investment = investments[investmentId];
        if (investment.status != InvestmentStatus.ACTIVE) return;
        
        // Execute withdrawal from protocol
        _executeWithdrawal(investmentId, recipient);
    }
    
    // ============ Investment Execution ============
    
    function _executeInvestment(
        bytes32 protocolId,
        uint256 strategyId,
        address asset,
        uint256 amount,
        address investor,
        bytes32 ccipMessageId
    ) internal returns (uint256 investmentId) {
        ProtocolInfo storage protocol = protocolInfo[protocolId];
        StrategyInfo memory strategy = strategyInfo[strategyId];
        
        // Create investment record
        investmentId = nextInvestmentId++;
        
        investments[investmentId] = Investment({
            protocolId: protocolId,
            strategyId: strategyId,
            asset: asset,
            amount: amount,
            timestamp: block.timestamp,
            chainId: uint64(block.chainid),
            status: InvestmentStatus.ACTIVE,
            expectedYield: 0, // To be calculated based on protocol
            actualYield: 0,
            ccipMessageId: ccipMessageId,
            investor: investor
        });
        
        // Update protocol stats
        protocol.totalInvested += amount;
        protocolInvestmentByChain[protocolId][uint64(block.chainid)] += amount;
        
        // Update strategy allocation
        strategyInfo[strategyId].totalAllocated += amount;
        
        // Execute strategy deposit
        IERC20(asset).approve(strategy.strategyAddress, amount);
        
        (bool success,) = strategy.strategyAddress.call(
            abi.encodeWithSelector(strategy.depositSelector, amount, asset)
        );
        
        if (!success) revert StrategyCallFailed();
        
        emit InvestmentMade(investmentId, protocolId, strategyId, asset, amount, uint64(block.chainid), ccipMessageId);
        
        return investmentId;
    }
    
    function _executeWithdrawal(uint256 investmentId, address recipient) internal {
        Investment storage investment = investments[investmentId];
        StrategyInfo memory strategy = strategyInfo[investment.strategyId];
        
        // Call strategy withdrawal
        (bool success, bytes memory returnData) = strategy.strategyAddress.call(
            abi.encodeWithSelector(strategy.withdrawSelector, investment.amount, investment.asset)
        );
        
        if (!success) revert StrategyCallFailed();
        
        // Calculate actual yield
        uint256 returnedAmount = abi.decode(returnData, (uint256));
        if (returnedAmount > investment.amount) {
            investment.actualYield = returnedAmount - investment.amount;
        }
        
        // Update investment status
        investment.status = InvestmentStatus.WITHDRAWN;
        
        // Update protocol and strategy stats
        protocolInfo[investment.protocolId].totalReturned += returnedAmount;
        strategyInfo[investment.strategyId].totalAllocated -= investment.amount;
        
        // Transfer to recipient
        IERC20(investment.asset).transfer(recipient, returnedAmount);
    }
    
    // ============ Helper Functions ============
    
    function _buildCCIPMessage(
        uint64 targetChain,
        address sourceAsset,
        address targetAsset,
        uint256 amount,
        bytes32 protocolId,
        uint256 strategyId,
        MessageType messageType,
        address recipient
    ) internal view returns (Client.EVM2AnyMessage memory) {
        // Build token transfer
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: sourceAsset,
            amount: amount
        });
        
        // Build message data
        bytes memory data = abi.encode(messageType, abi.encode(protocolId, strategyId, targetAsset, recipient));
        
        return Client.EVM2AnyMessage({
            receiver: abi.encode(chainInfo[targetChain].strategyManager),
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit, strict: false})),
            feeToken: address(linkToken)
        });
    }
    
    function _buildWithdrawMessage(
        uint64 targetChain,
        uint256 investmentId,
        address recipient
    ) internal view returns (Client.EVM2AnyMessage memory) {
        bytes memory data = abi.encode(MessageType.WITHDRAW, abi.encode(investmentId, recipient));
        
        return Client.EVM2AnyMessage({
            receiver: abi.encode(chainInfo[targetChain].strategyManager),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit, strict: false})),
            feeToken: address(linkToken)
        });
    }
    
    // ============ View Functions ============
    
    function getProtocolsByChain(uint64 chainId, ProtocolType protocolType) external view returns (bytes32[] memory) {
        return protocolsByChainAndType[chainId][protocolType];
    }
    
    function getInvestmentsByProtocol(bytes32 protocolId) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](nextInvestmentId - 1);
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextInvestmentId; i++) {
            if (investments[i].protocolId == protocolId) {
                result[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        assembly {
            mstore(result, count)
        }
        
        return result;
    }
    
    function getStrategyAllocation(uint256 strategyId) external view returns (uint256 allocated, uint256 maxAllocation) {
        StrategyInfo memory strategy = strategyInfo[strategyId];
        return (strategy.totalAllocated, strategy.maxAllocation);
    }
    
    function getCrossChainInvestmentStatus(bytes32 messageId) external view returns (CrossChainInvestment memory) {
        return crossChainInvestments[messageId];
    }
    
    function estimateCCIPFees(
        uint64 targetChain,
        address asset,
        uint256 amount,
        MessageType messageType
    ) external view returns (uint256) {
        if (messageType == MessageType.INVEST) {
            Client.EVM2AnyMessage memory message = _buildCCIPMessage(
                targetChain, asset, asset, amount, bytes32(0), 0, messageType, msg.sender
            );
            return IRouterClient(i_router).getFee(targetChain, message);
        }
        return 0;
    }
    
    // ============ Emergency Functions ============
    
    function emergencyWithdraw(uint256 investmentId) external onlyOwner {
        Investment storage investment = investments[investmentId];
        if (investment.status != InvestmentStatus.ACTIVE) revert InvestmentNotFound();
        
        _executeWithdrawal(investmentId, investment.investor);
        
        emit EmergencyWithdrawal(investmentId, investment.protocolId, investment.amount, investment.investor);
    }
    
    function pauseProtocol(bytes32 protocolId) external onlyOwner {
        protocolInfo[protocolId].isActive = false;
    }
    
    function updateAuthorizedSender(address sender, bool authorized) external onlyOwner {
        authorizedSenders[sender] = authorized;
    }
    
    function withdrawLinkTokens(uint256 amount) external onlyOwner {
        linkToken.transfer(owner(), amount);
    }
    
    // ============ Legacy Functions (Updated) ============
    
    function requestFundsFromPool(
        uint256 poolId,
        uint256 strategyId,
        address assetsTo,
        uint256[] calldata tokenIds,
        uint256[] calldata amountPercentages
    ) external nonReentrant onlyEliziaOrOwner returns (DepositedInfo memory) {
        if (tokenIds.length != amountPercentages.length) {
            revert ArrayLengthMismatch();
        }
        
        DepositedInfo memory result = _requestFundsFromPoolInternal(
            poolId, 
            strategyId, 
            assetsTo, 
            tokenIds, 
            amountPercentages
        );
        
        return result;
    }
    
    function _requestFundsFromPoolInternal(
        uint256 poolId,
        uint256 strategyId,
        address assetTo,
        uint256[] calldata tokenIds,
        uint256[] calldata amountPercentages
    ) internal returns (DepositedInfo memory) {
        address poolAddress = poolInfo[poolId];
        if (poolAddress == address(0)) {
            revert StrategyNotFound();
        }
        
        // Rest of the implementation remains similar to your original
        // but now tracks the allocation with cross-chain capabilities
        
        DepositedInfo memory depositInfo = DepositedInfo({
            amount: 0,
            asset: assetTo,
            timestamp: block.timestamp,
            amounts: new uint256[](0),
            assets: new address[](0),
            chainId: uint64(block.chainid),
            ccipMessageId: bytes32(0)
        });
        
        return depositInfo;
    }
    
    // ============ Overrides ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // Existing functions from your original contract can be maintained here
    // with enhancements for cross-chain tracking
}