// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {CustomRevert} from "../libraries/CustomRevert.sol";

contract PoolManagerStorage {
    using CustomRevert for bytes4;

    // ============ State Variables (Optimized Storage Layout) ============

    // Slot 1
    IPriceOracle public priceOracle;

    // Slot 2
    address internal strategyManager;
    uint8 internal _paused; // Using uint8 for bool to pack better
    uint88 internal _reserved; // Reserved for future use

    // Slot 3
    uint256 public totalValueLocked;

    // Slot 4
    uint256 internal _tokenIdCounter;

    struct AssetInfo {
        address asset; // Slot 1
        uint96 totalShares; // Slot 1 (packed)
        uint128 totalAssets; // Slot 2 (sufficient for most tokens)
        uint128 allocatedToStrategy; // Slot 2 (packed)
        string name; // Dynamic
        string symbol; // Dynamic
        uint8 decimals; // Slot after strings
        bool isActive; // Slot after strings (packed)
        uint32 lastUpdateTime; // Slot after strings (packed)
        uint64 totalYieldEarned; // Slot after strings (packed)
    }

    // Mappings
    mapping(uint256 => AssetInfo) public assets;
    mapping(address => uint256) public assetToTokenId;
    mapping(address => bool) public supportedAssets;

    // Dynamic array for active tokens
    uint256[] public activeTokenIds;

    // ============ Events ============

    event AssetAdded(uint256 indexed tokenId, address indexed asset, string name, string symbol);
    event AssetRemoved(uint256 indexed tokenId, address indexed asset);
    event Deposit(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares);
    event Withdrawal(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares);
    event StrategyAllocation(uint256 indexed tokenId, uint256 amount);
    event StrategyReturn(uint256 indexed tokenId, uint256 principal, uint256 yield);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event StrategyManagerUpdated(address indexed oldManager, address indexed newManager);
    event Paused(bool isPaused);

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
    error Overflow();
    error Pause();
    error PoolManagerLocked();

    // ============ Modifiers ============

    modifier whenNotPaused() {
        if (_paused == 1) Pause.selector.revertWith();
        _;
    }

    modifier onlyStrategyManager() {
        if (msg.sender != strategyManager) UnauthorizedCaller.selector.revertWith();
        _;
    }

    modifier validTokenId(uint256 tokenId) {
        if (tokenId == 0 || tokenId > _tokenIdCounter || !assets[tokenId].isActive) {
            InvalidTokenId.selector.revertWith();
        }
        _;
    }
}
