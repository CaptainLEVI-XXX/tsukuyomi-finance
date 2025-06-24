// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {ERC6909} from "@solmate/tokens/ERC6909.sol";
import {IERC20} from './interfaces/IERC20.sol';
import {CustomRevert} from './libraries/CustomRevert.sol';

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256 price, uint8 decimals);
    function getPriceInUSD(address asset) external view returns (uint256 priceInUSD);
}

/**
 * @title Enhanced Pool Manager
 * @notice A comprehensive pool manager that handles multi-asset deposits with oracle pricing and strategy allocations
 * @dev Consolidates vault functionality with proper fund tracking and oracle integration
 */
contract PoolManager is Initializable, UUPSUpgradeable, Ownable, ERC6909 {
    using CustomRevert for bytes4;

    // ============ State Variables ============
    
    IPriceOracle public priceOracle;
    address public strategyManager;
    uint256 public totalValueLocked; // Total USD value in the pool
    uint256 private _tokenIdCounter;
    
    struct AssetInfo {
        address asset;
        string name;
        string symbol;
        uint8 decimals;
        bool isActive;
        uint256 totalDeposited;        // Total amount deposited by users
        uint256 allocatedToStrategy;   // Amount currently allocated to strategies
        uint256 pendingYield;          // Yield pending distribution
        uint256 totalShares;           // Total shares for this asset
        uint256 lastYieldUpdate;       // Last time yield was updated
    }
    
    struct UserPosition {
        uint256 sharesOwned;
        uint256 lastDepositTime;
        uint256 accumulatedYield;
    }
    
    // Mappings
    mapping(uint256 tokenId => AssetInfo) public assets;
    mapping(address asset => uint256 tokenId) public assetToTokenId;
    mapping(uint256 tokenId => mapping(address user => UserPosition)) public userPositions;
    mapping(address asset => bool) public supportedAssets;
    
    uint256[] public activeTokenIds;
    
    // ============ Constants ============
    
    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_ALLOCATION_PERCENTAGE = 8000; // 80% max allocation to strategies
    
    // ============ Events ============
    
    event AssetAdded(uint256 indexed tokenId, address indexed asset, string name, string symbol);
    event AssetRemoved(uint256 indexed tokenId, address indexed asset);
    event Deposit(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares, uint256 usdValue);
    event Withdrawal(uint256 indexed tokenId, address indexed user, uint256 assets, uint256 shares, uint256 usdValue);
    event FundsAllocatedToStrategy(uint256 indexed tokenId, uint256 amount, uint256 usdValue);
    event FundsReturnedFromStrategy(uint256 indexed tokenId, uint256 principal, uint256 yield, uint256 totalReturned);
    event YieldDistributed(uint256 indexed tokenId, uint256 totalYield, uint256 timestamp);
    event OracleUpdated(address oldOracle, address newOracle);
    event StrategyManagerUpdated(address oldManager, address newManager);
    
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
    
    // ============ Modifiers ============
    
    modifier onlyStrategyManager() {
        if (msg.sender != strategyManager) revert UnauthorizedCaller();
        _;
    }
    
    modifier validTokenId(uint256 tokenId) {
        if (tokenId == 0 || tokenId > _tokenIdCounter || !assets[tokenId].isActive) {
            revert InvalidTokenId();
        }
        _;
    }
    
    modifier nonZeroAmount(uint256 amount) {
        if (amount == 0) revert InvalidAmount();
        _;
    }
    
    // ============ Initialization ============
    
    function initialize(
        address _owner,
        address _strategyManager,
        address _priceOracle
    ) public initializer {
        if (_owner == address(0) || _strategyManager == address(0) || _priceOracle == address(0)) {
            revert ZeroAddress();
        }
        
        _initializeOwner(_owner);
        strategyManager = _strategyManager;
        priceOracle = IPriceOracle(_priceOracle);
    }
    
    // ============ Asset Management ============
    
    function addAsset(
        address asset,
        string memory name,
        string memory symbol
    ) external onlyOwner returns (uint256 tokenId) {
        if (asset == address(0)) revert ZeroAddress();
        if (supportedAssets[asset]) revert AssetAlreadyExists();
        
        uint8 decimals = IERC20(asset).decimals();
        _tokenIdCounter++;
        tokenId = _tokenIdCounter;
        
        assets[tokenId] = AssetInfo({
            asset: asset,
            name: name,
            symbol: symbol,
            decimals: decimals,
            isActive: true,
            totalDeposited: 0,
            allocatedToStrategy: 0,
            pendingYield: 0,
            totalShares: 0,
            lastYieldUpdate: block.timestamp
        });
        
        assetToTokenId[asset] = tokenId;
        supportedAssets[asset] = true;
        activeTokenIds.push(tokenId);
        
        emit AssetAdded(tokenId, asset, name, symbol);
        return tokenId;
    }
    
    function removeAsset(uint256 tokenId) external onlyOwner validTokenId(tokenId) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        // Ensure no funds are allocated to strategies
        if (assetInfo.allocatedToStrategy > 0) revert InvalidAllocation();
        
        // Ensure no deposits remain
        if (assetInfo.totalDeposited > 0) revert InsufficientBalance();
        
        address asset = assetInfo.asset;
        assetInfo.isActive = false;
        supportedAssets[asset] = false;
        
        // Remove from active token IDs
        for (uint256 i = 0; i < activeTokenIds.length; i++) {
            if (activeTokenIds[i] == tokenId) {
                activeTokenIds[i] = activeTokenIds[activeTokenIds.length - 1];
                activeTokenIds.pop();
                break;
            }
        }
        
        emit AssetRemoved(tokenId, asset);
    }
    
    // ============ Deposit & Withdrawal Functions ============
    
    function deposit(
        uint256 tokenId,
        uint256 amount,
        address receiver
    ) external payable validTokenId(tokenId) nonZeroAmount(amount) returns (uint256 shares) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        // Calculate shares to mint
        shares = _calculateShares(tokenId, amount);
        
        // Get USD value for tracking
        uint256 usdValue = _getUSDValue(assetInfo.asset, amount);
        
        // Update state
        assetInfo.totalDeposited += amount;
        assetInfo.totalShares += shares;
        totalValueLocked += usdValue;
        
        // Update user position
        UserPosition storage position = userPositions[tokenId][receiver];
        position.sharesOwned += shares;
        position.lastDepositTime = block.timestamp;
        
        // Mint shares (ERC6909)
        _mint(receiver, tokenId, shares);
        
        // Transfer tokens
        IERC20(assetInfo.asset).transferFrom(msg.sender, address(this), amount);
        
        emit Deposit(tokenId, receiver, amount, shares, usdValue);
        return shares;
    }
    
    function withdraw(
        uint256 tokenId,
        uint256 shares,
        address receiver
    ) external validTokenId(tokenId) nonZeroAmount(shares) returns (uint256 assets) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        // Check user has enough shares
        if (balanceOf[msg.sender][tokenId] < shares) revert InsufficientBalance();
        
        // Calculate assets to return
        assets = _calculateAssets(tokenId, shares);
        
        // Check liquidity (available assets not allocated to strategies)
        uint256 availableAssets = assetInfo.totalDeposited - assetInfo.allocatedToStrategy;
        if (assets > availableAssets) revert InsufficientLiquidity();
        
        // Get USD value for tracking
        uint256 usdValue = _getUSDValue(assetInfo.asset, assets);
        
        // Update state
        assetInfo.totalDeposited -= assets;
        assetInfo.totalShares -= shares;
        totalValueLocked -= usdValue;
        
        // Update user position
        UserPosition storage position = userPositions[tokenId][msg.sender];
        position.sharesOwned -= shares;
        
        // Burn shares
        _burn(msg.sender, tokenId, shares);
        
        // Transfer assets
        IERC20(assetInfo.asset).transfer(receiver, assets);
        
        emit Withdrawal(tokenId, msg.sender, assets, shares, usdValue);
        return assets;
    }
    
    // ============ Strategy Management ============
    
    function allocateToStrategy(
        uint256 tokenId,
        uint256 amount
    ) external onlyStrategyManager validTokenId(tokenId) nonZeroAmount(amount) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        // Check available liquidity
        uint256 availableAssets = assetInfo.totalDeposited - assetInfo.allocatedToStrategy;
        if (amount > availableAssets) revert InsufficientLiquidity();
        
        // Check allocation limits (max 80% can be allocated)
        uint256 newAllocation = assetInfo.allocatedToStrategy + amount;
        uint256 maxAllocation = (assetInfo.totalDeposited * MAX_ALLOCATION_PERCENTAGE) / 10000;
        if (newAllocation > maxAllocation) revert InvalidAllocation();
        
        // Update allocation
        assetInfo.allocatedToStrategy += amount;
        
        // Get USD value for tracking
        uint256 usdValue = _getUSDValue(assetInfo.asset, amount);
        
        // Transfer to strategy manager
        IERC20(assetInfo.asset).transfer(strategyManager, amount);
        
        emit FundsAllocatedToStrategy(tokenId, amount, usdValue);
    }
    
    function returnFromStrategy(
        uint256 tokenId,
        uint256 principal,
        uint256 yield
    ) external onlyStrategyManager validTokenId(tokenId) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        uint256 totalReturned = principal + yield;
        
        // Ensure we don't return more than allocated
        if (principal > assetInfo.allocatedToStrategy) {
            principal = assetInfo.allocatedToStrategy;
        }
        
        // Update allocations
        assetInfo.allocatedToStrategy -= principal;
        assetInfo.totalDeposited += yield; // Add yield to total pool
        assetInfo.pendingYield += yield;
        assetInfo.lastYieldUpdate = block.timestamp;
        
        // Update total value locked with yield
        uint256 yieldUSDValue = _getUSDValue(assetInfo.asset, yield);
        totalValueLocked += yieldUSDValue;
        
        // Receive tokens back
        IERC20(assetInfo.asset).transferFrom(strategyManager, address(this), totalReturned);
        
        emit FundsReturnedFromStrategy(tokenId, principal, yield, totalReturned);
        
        // Distribute yield if significant amount
        if (yield > 0) {
            _distributeYield(tokenId);
        }
    }
    
    // ============ Yield Distribution ============
    
    function _distributeYield(uint256 tokenId) internal {
        AssetInfo storage assetInfo = assets[tokenId];
        
        if (assetInfo.pendingYield > 0 && assetInfo.totalShares > 0) {
            // Yield is automatically distributed proportionally when users withdraw
            // due to the share calculation including the increased total deposited
            
            emit YieldDistributed(tokenId, assetInfo.pendingYield, block.timestamp);
            assetInfo.pendingYield = 0;
        }
    }
    
    // ============ View Functions ============
    
    function getAssetInfo(uint256 tokenId) external view returns (AssetInfo memory) {
        return assets[tokenId];
    }
    
    function getUserPosition(uint256 tokenId, address user) external view returns (UserPosition memory) {
        return userPositions[tokenId][user];
    }
    
    function getAvailableLiquidity(uint256 tokenId) external view validTokenId(tokenId) returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        return assetInfo.totalDeposited - assetInfo.allocatedToStrategy;
    }
    
    function getTotalUSDValue() external view returns (uint256) {
        return totalValueLocked;
    }
    
    function getActiveTokenIds() external view returns (uint256[] memory) {
        return activeTokenIds;
    }
    
    function previewDeposit(uint256 tokenId, uint256 assets) external view validTokenId(tokenId) returns (uint256 shares) {
        return _calculateShares(tokenId, assets);
    }
    
    function previewWithdraw(uint256 tokenId, uint256 shares) external view validTokenId(tokenId) returns (uint256 assets) {
        return _calculateAssets(tokenId, shares);
    }
    
    // ============ Internal Functions ============
    
    function _calculateShares(uint256 tokenId, uint256 assets) internal view returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        if (assetInfo.totalShares == 0) {
            return assets;
        }
        
        // shares = (assets * totalShares) / totalDeposited
        return (assets * assetInfo.totalShares) / assetInfo.totalDeposited;
    }
    
    function _calculateAssets(uint256 tokenId, uint256 shares) internal view returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        if (assetInfo.totalShares == 0) {
            return shares;
        }
        
        // assets = (shares * totalDeposited) / totalShares
        return (shares * assetInfo.totalDeposited) / assetInfo.totalShares;
    }
    
    function _getUSDValue(address asset, uint256 amount) internal view returns (uint256) {
        try priceOracle.getPriceInUSD(asset) returns (uint256 priceInUSD) {
            return (amount * priceInUSD) / (10 ** IERC20(asset).decimals());
        } catch {
            revert OracleError();
        }
    }
    
    // ============ Admin Functions ============
    
    function updateOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();
        
        address oldOracle = address(priceOracle);
        priceOracle = IPriceOracle(newOracle);
        
        emit OracleUpdated(oldOracle, newOracle);
    }
    
    function updateStrategyManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert ZeroAddress();
        
        address oldManager = strategyManager;
        strategyManager = newManager;
        
        emit StrategyManagerUpdated(oldManager, newManager);
    }
    
    // ============ Emergency Functions ============
    
    function emergencyPause() external onlyOwner {
        // Implementation for emergency pause
    }
    
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        // Only allow recovery of non-supported assets
        if (supportedAssets[token]) revert AssetNotSupported();
        IERC20(token).transfer(owner(), amount);
    }
    
    // ============ Overrides ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // ERC6909 metadata functions
    function name(uint256 tokenId) public view returns (string memory) {
        return assets[tokenId].name;
    }
    
    function symbol(uint256 tokenId) public view returns (string memory) {
        return assets[tokenId].symbol;
    }
    
    function decimals(uint256 tokenId) public view returns (uint8) {
        return assets[tokenId].decimals;
    }
}