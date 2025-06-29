// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {ERC6909} from "@solmate/tokens/ERC6909.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {CustomRevert} from "./libraries/CustomRevert.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {Lock} from "./libraries/Lock.sol";
import {PoolManagerStorage} from "./storage/PoolManager.sol";

/**
 * @title Pool Manager
 * @notice A pool manager that handles multi-asset deposits with oracle pricing and strategy allocations
 */
contract PoolManager is Initializable, UUPSUpgradeable, Ownable, ERC6909, PoolManagerStorage {
    using CustomRevert for bytes4;
    using SafeTransferLib for address;

    uint256 internal constant PRECISION = 1e18;
    uint256 internal constant MAX_ALLOCATION_BPS = 8000; // 80% in basis points
    uint256 internal constant BPS_DIVISOR = 10000;
    uint256 internal constant MINIMUM_SHARES = 1000;

    /// @dev Modifier to prevent reentrancy attacks
    modifier nonReentrant() {
        if (Lock.isUnlocked()) PoolManagerLocked.selector.revertWith();
        Lock.unlock();
        _;
        Lock.lock();
    }

    // ============ Initialization ============

    function initialize(address _owner, address _strategyManager, address _priceOracle) public initializer {
        if (_owner == address(0) || _strategyManager == address(0) || _priceOracle == address(0)) {
            ZeroAddress.selector.revertWith();
        }

        _initializeOwner(_owner);
        strategyManager = _strategyManager;
        priceOracle = IPriceOracle(_priceOracle);
    }

    // ============ Core Functions ============

    /**
     * @notice Add a new asset to the pool
     * @param asset The asset address
     * @param _name The asset name for ERC6909
     * @param _symbol The asset symbol for ERC6909
     * @return tokenId The assigned token ID
     */
    function addAsset(address asset, string calldata _name, string calldata _symbol)
        external
        onlyOwner
        returns (uint256 tokenId)
    {
        if (asset == address(0)) ZeroAddress.selector.revertWith();
        if (supportedAssets[asset]) AssetAlreadyExists.selector.revertWith();

        tokenId = ++_tokenIdCounter;

        assets[tokenId] = AssetInfo({
            asset: asset,
            totalShares: 0,
            totalAssets: 0,
            allocatedToStrategy: 0,
            name: _name,
            symbol: _symbol,
            decimals: IERC20(asset).decimals(),
            isActive: true,
            lastUpdateTime: uint32(block.timestamp),
            totalYieldEarned: 0
        });

        assetToTokenId[asset] = tokenId;
        supportedAssets[asset] = true;
        activeTokenIds.push(tokenId);

        emit AssetAdded(tokenId, asset, _name, _symbol);
    }

    /**
     * @notice Deposit assets and receive shares
     * @param tokenId The token ID to deposit
     * @param amount The amount of assets to deposit
     * @param receiver The address to receive shares
     * @return shares The amount of shares minted
     */
    function deposit(uint256 tokenId, uint256 amount, address receiver)
        external
        whenNotPaused
        validTokenId(tokenId)
        nonReentrant
        returns (uint256 shares)
    {
        if (amount == 0) InvalidAmount.selector.revertWith();

        AssetInfo storage assetInfo = assets[tokenId];

        // Calculate shares
        uint256 _totalAssets = assetInfo.totalAssets;
        uint256 _totalShares = assetInfo.totalShares;

        if (_totalShares == 0 || _totalAssets == 0) {
            shares = amount < MINIMUM_SHARES ? MINIMUM_SHARES : amount;
        } else {
            shares = (amount * _totalShares) / _totalAssets;
            if (shares < MINIMUM_SHARES) MinimumSharesRequired.selector.revertWith();
        }

        // Transfer assets (CEI pattern)
        assetInfo.asset.safeTransferFrom(msg.sender, address(this), amount);

        // Update state with overflow checks
        unchecked {
            uint256 newTotalAssets = _totalAssets + amount;
            if (newTotalAssets < _totalAssets) revert Overflow();
            assetInfo.totalAssets = uint128(newTotalAssets);

            uint256 newTotalShares = _totalShares + shares;
            if (newTotalShares < _totalShares) revert Overflow();
            assetInfo.totalShares = uint96(newTotalShares);
        }

        assetInfo.lastUpdateTime = uint32(block.timestamp);

        // Update TVL
        totalValueLocked += _getUSDValue(assetInfo.asset, amount);

        // Mint shares using ERC6909's _mint
        _mint(receiver, tokenId, shares);

        emit Deposit(tokenId, receiver, amount, shares);
    }

    /**
     * @notice Withdraw assets by burning shares
     * @param tokenId The token ID to withdraw
     * @param shares The amount of shares to burn
     * @param receiver The address to receive assets
     * @return amount The amount of assets withdrawn
     */
    function withdraw(uint256 tokenId, uint256 shares, address receiver)
        external
        whenNotPaused
        validTokenId(tokenId)
        nonReentrant
        returns (uint256 amount)
    {
        if (shares == 0) InvalidAmount.selector.revertWith();

        // Check balance using ERC6909's balanceOf
        if (balanceOf[msg.sender][tokenId] < shares) InsufficientBalance.selector.revertWith();

        AssetInfo storage assetInfo = assets[tokenId];

        // Calculate assets to return
        amount = (shares * assetInfo.totalAssets) / assetInfo.totalShares;

        // Check available liquidity
        uint256 available = assetInfo.totalAssets - assetInfo.allocatedToStrategy;
        if (amount > available) InsufficientLiquidity.selector.revertWith();

        // Burn shares first using ERC6909's _burn
        _burn(msg.sender, tokenId, shares);

        // Update state
        unchecked {
            assetInfo.totalAssets = uint128(assetInfo.totalAssets - amount);
            assetInfo.totalShares = uint96(assetInfo.totalShares - shares);
        }
        assetInfo.lastUpdateTime = uint32(block.timestamp);

        // Update TVL
        totalValueLocked -= _getUSDValue(assetInfo.asset, amount);

        // Transfer assets
        assetInfo.asset.safeTransfer(receiver, amount);

        emit Withdrawal(tokenId, msg.sender, amount, shares);
    }

    // ============ Strategy Functions ============

    /**
     * @notice Allocate funds to strategy (only callable by strategy manager)
     * @param tokenId The token ID
     * @param amount The amount to allocate
     */
    function allocateToStrategy(uint256 tokenId, uint256 amount)
        external
        onlyStrategyManager
        validTokenId(tokenId)
        nonReentrant
    {
        if (amount == 0) InvalidAmount.selector.revertWith();

        AssetInfo storage assetInfo = assets[tokenId];

        // Check available liquidity
        uint256 available = assetInfo.totalAssets - assetInfo.allocatedToStrategy;
        if (amount > available) InsufficientLiquidity.selector.revertWith();

        // Check allocation limit
        uint256 newAllocation = assetInfo.allocatedToStrategy + amount;
        uint256 maxAllocation = (assetInfo.totalAssets * MAX_ALLOCATION_BPS) / BPS_DIVISOR;
        if (newAllocation > maxAllocation) InvalidAllocation.selector.revertWith();

        // Update allocation
        assetInfo.allocatedToStrategy = uint128(newAllocation);

        // Transfer to strategy
        assetInfo.asset.safeTransfer(strategyManager, amount);

        emit StrategyAllocation(tokenId, amount);
    }

    /**
     * @notice Return funds from strategy with yield
     * @param tokenId The token ID
     * @param principal The principal amount being returned
     * @param yield The yield earned
     */
    function returnFromStrategy(uint256 tokenId, uint256 principal, uint256 yield)
        external
        onlyStrategyManager
        validTokenId(tokenId)
        nonReentrant
    {
        AssetInfo storage assetInfo = assets[tokenId];

        // Cap principal to allocated amount
        if (principal > assetInfo.allocatedToStrategy) {
            principal = assetInfo.allocatedToStrategy;
        }

        uint256 totalReturn = principal + yield;

        // Transfer funds back
        assetInfo.asset.safeTransferFrom(strategyManager, address(this), totalReturn);

        // Update state
        unchecked {
            assetInfo.allocatedToStrategy = uint128(assetInfo.allocatedToStrategy - principal);

            // Add yield to total assets (this increases share value)
            uint256 newTotalAssets = assetInfo.totalAssets + yield;
            if (newTotalAssets > type(uint128).max) Overflow.selector.revertWith();
            assetInfo.totalAssets = uint128(newTotalAssets);

            assetInfo.totalYieldEarned += uint64(yield);
        }

        // Update TVL with yield
        if (yield > 0) {
            totalValueLocked += _getUSDValue(assetInfo.asset, yield);
        }

        emit StrategyReturn(tokenId, principal, yield);
    }

    // ============ View Functions ============

    /**
     * @notice Get the current value of one share
     * @param tokenId The token ID
     * @return value The value of one share in asset terms
     */
    function getShareValue(uint256 tokenId) external view validTokenId(tokenId) returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        if (assetInfo.totalShares == 0) return 10 ** assetInfo.decimals;
        return (assetInfo.totalAssets * (10 ** assetInfo.decimals)) / assetInfo.totalShares;
    }

    /**
     * @notice Preview how many shares would be minted for a deposit
     * @param tokenId The token ID
     * @param amount The amount of assets to deposit
     * @return shares The amount of shares that would be minted
     */
    function previewDeposit(uint256 tokenId, uint256 amount)
        external
        view
        validTokenId(tokenId)
        returns (uint256 shares)
    {
        AssetInfo storage assetInfo = assets[tokenId];

        if (assetInfo.totalShares == 0 || assetInfo.totalAssets == 0) {
            shares = amount < MINIMUM_SHARES ? MINIMUM_SHARES : amount;
        } else {
            shares = (amount * assetInfo.totalShares) / assetInfo.totalAssets;
        }
    }

    /**
     * @notice Preview how many assets would be withdrawn for shares
     * @param tokenId The token ID
     * @param shares The amount of shares to burn
     * @return amount The amount of assets that would be withdrawn
     */
    function previewWithdraw(uint256 tokenId, uint256 shares) external view validTokenId(tokenId) returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        if (assetInfo.totalShares == 0) return 0;
        return (shares * assetInfo.totalAssets) / assetInfo.totalShares;
    }

    /**
     * @notice Get available liquidity for a token
     * @param tokenId The token ID
     * @return available The amount of assets available for withdrawal
     */
    function getAvailableLiquidity(uint256 tokenId) external view validTokenId(tokenId) returns (uint256) {
        AssetInfo storage assetInfo = assets[tokenId];
        return assetInfo.totalAssets - assetInfo.allocatedToStrategy;
    }

    /**
     * @notice Get user's total asset value including yield
     * @param tokenId The token ID
     * @param user The user address
     * @return value The current value in asset terms
     */
    function getUserAssetValue(uint256 tokenId, address user) external view returns (uint256) {
        uint256 shares = balanceOf[user][tokenId]; // Using ERC6909's balanceOf
        if (shares == 0) return 0;

        AssetInfo storage assetInfo = assets[tokenId];
        return (shares * assetInfo.totalAssets) / assetInfo.totalShares;
    }

    /**
     * @notice Get all active token IDs
     * @return The array of active token IDs
     */
    function getActiveTokenIds() external view returns (uint256[] memory) {
        return activeTokenIds;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the price oracle
     * @param newOracle The new oracle address
     */
    function updateOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) ZeroAddress.selector.revertWith();

        address oldOracle = address(priceOracle);
        priceOracle = IPriceOracle(newOracle);

        emit OracleUpdated(oldOracle, newOracle);
    }

    /**
     * @notice Update the strategy manager
     * @param newManager The new strategy manager address
     */
    function updateStrategyManager(address newManager) external onlyOwner {
        if (newManager == address(0)) ZeroAddress.selector.revertWith();

        address oldManager = strategyManager;
        strategyManager = newManager;

        emit StrategyManagerUpdated(oldManager, newManager);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _paused = 1;
        emit Paused(true);
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _paused = 0;
        emit Paused(false);
    }

    /**
     * @notice Recover mistakenly sent tokens (not pool assets)
     * @param token The token to recover
     * @param amount The amount to recover
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        if (supportedAssets[token]) AssetNotSupported.selector.revertWith();
        token.safeTransfer(owner(), amount);
    }

    // ============ Internal Functions ============

    /**
     * @dev Get USD value of an asset amount
     * @param asset The asset address
     * @param amount The amount
     * @return The USD value
     */
    function _getUSDValue(address asset, uint256 amount) private view returns (uint256) {
        try priceOracle.getPriceInUSD(asset) returns (uint256 priceInUSD) {
            return (amount * priceInUSD) / (10 ** IERC20(asset).decimals());
        } catch {
            // If oracle fails, return 0 to not block operations
            // Consider whether to revert based on your requirements
            return 0;
        }
    }

    // ============ UUPS Functions ============

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ ERC6909 Metadata Functions ============

    function name(uint256 id) public view returns (string memory) {
        return assets[id].name;
    }

    function symbol(uint256 id) public view returns (string memory) {
        return assets[id].symbol;
    }

    function decimals(uint256 id) public view returns (uint8) {
        return assets[id].decimals;
    }

    function asset(uint256 id) public view returns (address) {
        return assets[id].asset;
    }

    function getTokenIdForAsset(address _asset) public view returns (uint256) {
        return assetToTokenId[_asset];
    }
}
