// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract CrossChainStrategyManagerStorage {
    struct StrategyInfo {
        string name;
        address strategyAddress;
        uint64 chainSelector; // Chain where strategy is deployed
        bytes4 depositSelector;
        bytes4 withdrawSelector;
        bytes4 balanceSelector; // For checking positions
        bool isActive;
        uint256 totalAllocated; // Total funds allocated to this strategy
        uint256 lastUpdateTime;
    }

    struct CrossChainDeposit {
        uint256 strategyId;
        uint64 sourceChain;
        uint64 destinationChain;
        address asset;
        uint256 amount;
        uint256 timestamp;
        bytes32 ccipMessageId;
        DepositStatus status;
        uint256 poolId; // Track which pool funds came from
    }

    struct ChainInfo {
        uint64 chainSelector;
        address strategyManager; // Strategy manager on that chain
        bool isActive;
        uint256 totalValueLocked;
    }

    struct AllocationInfo {
        uint256 strategyId;
        address asset;
        uint256 principal; // Original amount invested
        uint256 currentValue; // Current value including yield
        uint256 lastHarvestTime;
        bool isActive;
    }

    struct CrossChainMessage {
        MessageType messageType;
        uint256 strategyId;
        address asset;
        uint256 amount;
        uint256 poolId;
        uint64 sourceChain;
        address sourceManager;
    }

    enum DepositStatus {
        Pending,
        Completed,
        Failed,
        Withdrawn
    }

    enum MessageType {
        DepositRequest,
        WithdrawRequest,
        PositionUpdate,
        EmergencyWithdraw,
        DepositConfirmation,
        WithdrawConfirmation
    }

    // ============ State Variables ============

    address public linkToken;
    uint64 public currentChainSelector;

    // Strategy management
    mapping(uint256 => StrategyInfo) public strategies;
    mapping(uint256 => mapping(address => AllocationInfo)) public allocations; // strategyId => asset => allocation
    uint256 public nextStrategyId;

    // Cross-chain tracking
    mapping(uint64 => ChainInfo) public chainInfo;
    mapping(bytes32 => CrossChainDeposit) public crossChainDeposits;
    mapping(uint256 => uint256) public depositIdToStrategyId;
    mapping(bytes32 => bool) public processedMessages; // Prevent duplicate processing
    uint256 public nextDepositId;

    // Pool management
    mapping(uint256 => address) public pools;
    uint256 public nextPoolId;

    // Access control
    address public controller; // Can be an AI agent or multisig
    mapping(address => bool) public allowedCallers;

    // Risk management
    uint256 public maxAllocationPerStrategy = 5000; // 50% max per strategy
    uint256 public maxCrossChainGasLimit = 500000;

    // Swap routers per chain
    mapping(uint64 => address) public swapRouters;

    // CCIP configuration
    bytes public ccipExtraArgs;

    // ============ Events ============

    event StrategyRegistered(uint256 indexed strategyId, string name, address strategyAddress, uint64 chainSelector);

    event CrossChainDepositInitiated(
        uint256 indexed depositId,
        uint256 indexed strategyId,
        uint64 sourceChain,
        uint64 destinationChain,
        address asset,
        uint256 amount,
        bytes32 ccipMessageId
    );

    event CrossChainDepositCompleted(uint256 indexed depositId, uint256 indexed strategyId, uint256 actualAmount);

    event CrossChainWithdrawInitiated(uint256 indexed strategyId, address asset, uint256 amount, bytes32 ccipMessageId);

    event CrossChainWithdrawCompleted(uint256 indexed strategyId, address asset, uint256 amount, uint256 poolId);

    event AllocationUpdated(uint256 indexed strategyId, address indexed asset, uint256 principal, uint256 currentValue);

    event ChainAdded(uint64 indexed chainSelector, address strategyManager);
    event PoolAdded(uint256 indexed poolId, address indexed poolAddress);
    event YieldHarvested(uint256 indexed strategyId, address asset, uint256 yield);
    event EmergencyWithdrawal(uint256 indexed strategyId, address asset, uint256 amount);
    event CCIPMessageReceived(bytes32 indexed messageId, uint64 sourceChain, MessageType messageType);
    event CCIPMessageSent(bytes32 indexed messageId, uint64 destinationChain, MessageType messageType);

    // ============ Errors ============

    error InvalidStrategy();
    error InvalidChain();
    error InvalidAmount();
    error UnauthorizedCaller();
    error AllocationLimitExceeded();
    error CrossChainMessageFailed();
    error InsufficientLinkBalance();
    error StrategyNotActive();
    error ChainNotSupported();
    error MessageAlreadyProcessed();
    error InvalidSourceChain();
    error ZeroAddress();
}
