// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {ERC6909} from "@solmate/tokens/ERC6909.sol";
import {IERC20} from './interfaces/IERC20.sol';
import {CustomRevert} from './libraries/CustomRevert.sol';

/**
 * @title  Pool Manager
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
            totalAssets: 0,
            allocatedToStrategy: 0,
            totalShares: 0,
            lastUpdateTime: block.timestamp,
            totalYieldEarned: 0
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
        if (assetInfo.totalAssets > 0) revert InsufficientBalance();
        
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
        shares = _convertToShares(tokenId, amount);
        
        // Ensure minimum shares to prevent rounding issues
        if (shares < MINIMUM_SHARES && assetInfo.totalShares > 0) revert MinimumSharesRequired();
        
        // Get USD value for tracking
        uint256 usdValue = _getUSDValue(assetInfo.asset, amount);
        
        // Transfer tokens first (checks-effects-interactions)
        IERC20(assetInfo.asset).transferFrom(msg.sender, address(this), amount);
        
        // Update state
        assetInfo.totalAssets += amount;
        assetInfo.totalShares += shares;
        totalValueLocked += usdValue;
        assetInfo.lastUpdateTime = block.timestamp;
        
        // Update user position
        UserPosition storage position = userPositions[tokenId][receiver];
        position.lastInteractionTime = block.timestamp;
        
        // Mint shares (ERC6909)
        _mint(receiver, tokenId, shares);
        
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
        
        // Calculate assets to return (includes proportional yield)
        assets = _convertToAssets(tokenId, shares);
        
        // Check liquidity (available assets not allocated to strategies)
        uint256 availableAssets = assetInfo.totalAssets - assetInfo.allocatedToStrategy;
        if (assets > availableAssets) revert InsufficientLiquidity();
        
        // Get USD value for tracking
        uint256 usdValue = _getUSDValue(assetInfo.asset, assets);
        
        // Burn shares first
        _burn(msg.sender, tokenId, shares);
        
        // Update state
        assetInfo.totalAssets -= assets;
        assetInfo.totalShares -= shares;
        totalValueLocked -= usdValue;
        assetInfo.lastUpdateTime = block.timestamp;
        
        // Update user position
        UserPosition storage position = userPositions[tokenId][msg.sender];
        position.lastInteractionTime = block.timestamp;
        
        // Track yield withdrawn for analytics
        uint256 principalPortion = (shares * assetInfo.totalAssets) / assetInfo.totalShares;
        if (assets > principalPortion) {
            position.cumulativeYieldWithdrawn += (assets - principalPortion);
        }
        
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
        uint256 availableAssets = assetInfo.totalAssets - assetInfo.allocatedToStrategy;
        if (amount > availableAssets) revert InsufficientLiquidity();
        
        // Check allocation limits (max 80% can be allocated)
        uint256 newAllocation = assetInfo.allocatedToStrategy + amount;
        uint256 maxAllocation = (assetInfo.totalAssets * MAX_ALLOCATION_PERCENTAGE) / 10000;
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
        
        // Ensure we don't return more principal than allocated
        if (principal > assetInfo.allocatedToStrategy) {
            principal = assetInfo.allocatedToStrategy;
        }
        
        // Receive tokens back first
        IERC20(assetInfo.asset).transferFrom(strategyManager, address(this), totalReturned);
        
        // Update allocations
        assetInfo.allocatedToStrategy -= principal;
        
        // Add yield to total assets (this increases share value)
        if (yield > 0) {
            assetInfo.totalAssets += yield;
            assetInfo.totalYieldEarned += yield;
            
            // Update total value locked with yield
            uint256 yieldUSDValue = _getUSDValue(assetInfo.asset, yield);
            totalValueLocked += yieldUSDValue;
            
            // Calculate and emit new share value
            uint256 newShareValue = getShareValue(tokenId);
            emit YieldAccrued(tokenId, yield, newShareValue);
        }
        
        assetInfo.lastUpdateTime = block.timestamp;
        
        emit FundsReturnedFromStrategy(tokenId, principal, yield, totalReturned);
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
        return assetInfo.totalAssets - assetInfo.allocatedToStrategy;
    }
    
    function getTotalUSDValue() external view returns (uint256) {
        return totalValueLocked;
    }
    
    function getActiveTokenIds() external view returns (uint256[] memory) {
        return activeTokenIds;
    }
    
    function previewDeposit(uint256 tokenId, uint256 assets) external view validTokenId(tokenId) returns (uint256 shares) {
        return _convertToShares(tokenId, assets);
    }
    
    function previewWithdraw(uint256 tokenId, uint256 shares) external view validTokenId(tokenId) returns (uint256 assets) {
        return _convertToAssets(tokenId, shares);
    }
    
    /**
     * @notice Get the current value of one share in asset terms
     * @param tokenId The token ID to check
     * @return The value of one share (with decimals matching the asset)
     */
    function getShareValue(uint256 tokenId) public view validTokenId(tokenId) returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        if (assetInfo.totalShares == 0) {
            return 10 ** assetInfo.decimals; // 1:1 when no shares exist
        }
        return (assetInfo.totalAssets * (10 ** assetInfo.decimals)) / assetInfo.totalShares;
    }
    
    /**
     * @notice Get user's asset value including unrealized yield
     * @param tokenId The token ID
     * @param user The user address
     * @return Current value of user's position in asset terms
     */
    function getUserAssetValue(uint256 tokenId, address user) external view validTokenId(tokenId) returns (uint256) {
        uint256 userShares = balanceOf[user][tokenId];
        if (userShares == 0) return 0;
        return _convertToAssets(tokenId, userShares);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev Convert asset amount to shares
     * @param tokenId The token ID
     * @param assets The amount of assets to convert
     * @return shares The equivalent amount of shares
     */
    function _convertToShares(uint256 tokenId, uint256 assets) internal view returns (uint256 shares) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        if (assetInfo.totalShares == 0 || assetInfo.totalAssets == 0) {
            // First deposit - 1:1 ratio but with minimum shares consideration
            shares = assets;
            if (shares < MINIMUM_SHARES) shares = MINIMUM_SHARES;
        } else {
            // shares = (assets * totalShares) / totalAssets
            shares = (assets * assetInfo.totalShares) / assetInfo.totalAssets;
        }
        
        return shares;
    }
    
    /**
     * @dev Convert shares to asset amount
     * @param tokenId The token ID
     * @param shares The amount of shares to convert
     * @return assets The equivalent amount of assets
     */
    function _convertToAssets(uint256 tokenId, uint256 shares) internal view returns (uint256 assets) {
        AssetInfo storage assetInfo = assets[tokenId];
        
        if (assetInfo.totalShares == 0) {
            return 0;
        }
        
        // assets = (shares * totalAssets) / totalShares
        // This automatically includes any yield earned
        assets = (shares * assetInfo.totalAssets) / assetInfo.totalShares;
        
        return assets;
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
    
    bool public paused;
    
    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }
    
    function emergencyPause() external onlyOwner {
        paused = true;
    }
    
    function unpause() external onlyOwner {
        paused = false;
    }
    
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        // Only allow recovery of non-supported assets
        if (supportedAssets[token]) revert AssetNotSupported();
        IERC20(token).transfer(owner(), amount);
    }
    
    // ============ Overrides ============
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // Override deposit and withdraw to add pause functionality
    function _mint(address to, uint256 id, uint256 amount) internal override whenNotPaused {
        super._mint(to, id, amount);
    }
    
    function _burn(address from, uint256 id, uint256 amount) internal override whenNotPaused {
        super._burn(from, id, amount);
    }
    
    // ERC6909 metadata functions
    function name(uint256 tokenId) public view override returns (string memory) {
        return assets[tokenId].name;
    }
    
    function symbol(uint256 tokenId) public view override returns (string memory) {
        return assets[tokenId].symbol;
    }
    
    function decimals(uint256 tokenId) public view override returns (uint8) {
        return assets[tokenId].decimals;
    }
}