// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

contract PoolManagerStorage {
    struct AssetInfo {
        address asset;
        string name;
        string symbol;
        uint8 decimals;
        bool isActive;
        uint256 totalAssets; // Total assets under management (deposits + yields - withdrawals)
        uint256 allocatedToStrategy; // Amount currently allocated to strategies
        uint256 totalShares; // Total shares for this asset
        uint256 lastUpdateTime; // Last time the asset info was updated
        uint256 totalYieldEarned; // Cumulative yield earned (for tracking)
    }

    struct UserPosition {
        uint256 lastInteractionTime;
        uint256 cumulativeYieldWithdrawn;
    }

    // ============ State Variables ============

    IPriceOracle public priceOracle;
    address public strategyManager;
    uint256 public totalValueLocked; // Total USD value in the pool
    uint256 private _tokenIdCounter;

    // Mappings
    mapping(uint256 tokenId => AssetInfo) public assets;
    mapping(address asset => uint256 tokenId) public assetToTokenId;
    mapping(uint256 tokenId => mapping(address user => UserPosition)) public userPositions;
    mapping(address asset => bool) public supportedAssets;

    uint256[] public activeTokenIds;

    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_ALLOCATION_PERCENTAGE = 8000; // 80% max allocation to strategies
    uint256 public constant MINIMUM_SHARES = 1000; // Minimum shares to prevent rounding issues

    // ============ Errors ============

    error AssetNotSupported();
    error AssetAlreadyExists();
    error InvalidTokenId();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error InvalidAmount();
    error InvalidAllocation();
    error UnauthorizedCaller();
    error OracleError();
    error ZeroAddress();
    error MinimumSharesRequired();

    // ============ Events ============

    event AssetAdded(uint256 indexed tokenId, address indexed asset, string name, string symbol);
    event AssetRemoved(uint256 indexed tokenId, address indexed asset);
    event Deposit(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares, uint256 usdValue);
    event Withdrawal(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares, uint256 usdValue);
    event FundsAllocatedToStrategy(uint256 indexed tokenId, uint256 amount, uint256 usdValue);
    event FundsReturnedFromStrategy(uint256 indexed tokenId, uint256 principal, uint256 yield, uint256 totalReturned);
    event YieldAccrued(uint256 indexed tokenId, uint256 yield, uint256 newShareValue);
    event OracleUpdated(address oldOracle, address newOracle);
    event StrategyManagerUpdated(address oldManager, address newManager);
}
