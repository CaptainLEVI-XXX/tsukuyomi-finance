// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPoolManager} from "./interfaces/IPoolManager.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/**
 * @title StrategyManager
 * @dev Manages investment strategies and batch fund allocation from pools
 */
contract StrategyManager is 
    UUPSUpgradeable, 
    Ownable,
    Initializable
{
    // Structs
    struct StrategyInfo {
        string name;
        address strategyAddress;
        bytes4 depositSelector;
        bytes4 withdrawSelector;
        bool isRegistered;
    }

    struct DepositedInfo {
        uint256 amount;
        address asset;
        uint256 timestamp;
        uint256[] amounts;
        address[] assets;
    }

    // State variables
    mapping(uint256 => StrategyInfo) public strategyInfo;
    mapping(uint256 => address) public poolInfo;
    uint256 public depositId;
    uint256 public nextStrategyId;
    uint256 public totalRegisteredStrategies;
    address public elizia; // Protocol controller address
    uint256 public nextPoolId;
    address public uniswapRouter;
    
    // Mapping for deposit info
    mapping(uint256 => DepositedInfo) public depositedInfo;

    // Events
    event StrategyRegistered(
        string indexed name,
        uint256 indexed strategyId,
        address indexed strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector
    );

    event StrategyRemoved(uint256 indexed strategyId);

    event StrategyUpdated(
        uint256 indexed strategyId,
        address indexed strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector
    );

    event PoolAdded(
        uint256 indexed poolId,
        address indexed poolAddress
    );

    event FundsRequested(
        uint256 indexed poolId,
        uint256 indexed strategyId,
        address indexed assetTo,
        uint256 amount,
        uint256 depositId
    );

    event RouterUpdated(
        address indexed oldRouter,
        address indexed newRouter
    );

    // Errors
    error InvalidStrategy();
    error StrategyNotFound();
    error ZeroAddress();
    error ArrayLengthMismatch();
    error StrategyCallFailed();

    // Initializer (replaces constructor in upgradeable contracts)
    function initialize(
        address _elizia,
        address _owner,
        address _uniswapRouter
    ) public initializer {
        if (_elizia == address(0) || _owner == address(0) || _uniswapRouter == address(0)) {
            revert ZeroAddress();
        }
        _initializeOwner(_owner);
        
        // Initialize state variables
        elizia = _elizia;
        uniswapRouter = _uniswapRouter;
        
        // Initialize counters
        nextStrategyId = 1;
        nextPoolId = 1;
        depositId = 0;
        totalRegisteredStrategies = 0;
    }

    // Core functions
    function getPool(uint256 poolId) external view returns (address) {
        return poolInfo[poolId];
    }

    function getTotalPools() external view returns (uint256) {
        return nextPoolId - 1;
    }

    function getDepositInfo(uint256 _depositId) external view returns (DepositedInfo memory) {
        return depositedInfo[_depositId];
    }

    function getTotalDeposits() external view returns (uint256) {
        return depositId;
    }

    function addPool(address poolAddress) external onlyOwner nonReentrant returns (uint256) {
        if (poolAddress == address(0)) {
            revert InvalidStrategy();
        }

        uint256 poolId = nextPoolId;
        poolInfo[poolId] = poolAddress;
        nextPoolId++;

        emit PoolAdded(poolId, poolAddress);
        return poolId;
    }

    function updateUniswapRouter(address newRouter) external onlyOwner {
        if (newRouter == address(0)) {
            revert ZeroAddress();
        }
        
        address oldRouter = uniswapRouter;
        uniswapRouter = newRouter;
        
        emit RouterUpdated(oldRouter, newRouter);
    }

    function addStrategy(
        string memory name,
        address strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector
    ) external onlyOwner nonReentrant returns (uint256) {
        if (strategyAddress == address(0)) {
            revert InvalidStrategy();
        }
        
        uint256 strategyId = nextStrategyId;
        
        StrategyInfo memory strategy = StrategyInfo({
            name: name,
            strategyAddress: strategyAddress,
            depositSelector: depositSelector,
            withdrawSelector: withdrawSelector,
            isRegistered: true
        });
        
        strategyInfo[strategyId] = strategy;
        
        nextStrategyId++;
        totalRegisteredStrategies++;
        
        emit StrategyRegistered(
            name,
            strategyId,
            strategyAddress,
            depositSelector,
            withdrawSelector
        );
        
        return strategyId;
    }

    function removeStrategy(uint256 strategyId) external onlyOwner nonReentrant {
        StrategyInfo storage strategy = strategyInfo[strategyId];
        if (!strategy.isRegistered) {
            revert StrategyNotFound();
        }
        
        strategy.isRegistered = false;
        totalRegisteredStrategies--;
        
        emit StrategyRemoved(strategyId);
    }

    function updateEliziaAddress(address newEliziaAddress) external onlyOwner {
        if (newEliziaAddress == address(0)) {
            revert ZeroAddress();
        }
        elizia = newEliziaAddress;
    }

    function updateStrategy(
        uint256 strategyId,
        address strategyAddress,
        bytes4 depositSelector,
        bytes4 withdrawSelector
    ) external onlyOwner nonReentrant {
        StrategyInfo storage strategy = strategyInfo[strategyId];
        if (!strategy.isRegistered) {
            revert StrategyNotFound();
        }
        
        strategy.strategyAddress = strategyAddress;
        strategy.depositSelector = depositSelector;
        strategy.withdrawSelector = withdrawSelector;
        
        emit StrategyUpdated(
            strategyId,
            strategyAddress,
            depositSelector,
            withdrawSelector
        );
    }

    function getStrategy(uint256 strategyId) external view returns (StrategyInfo memory) {
        return strategyInfo[strategyId];
    }

    function getTotalStrategies() external view returns (uint256) {
        return totalRegisteredStrategies;
    }

    /**
     * @dev Request funds from a pool for a specific strategy, with batch processing
     * @param poolId ID of the pool to request funds from
     * @param strategyId ID of the strategy to use
     * @param assetsTo Target asset to convert all funds to
     * @param tokenIds Array of token IDs to request from the pool
     * @param amountPercentages Array of percentages of available assets to request (in basis points, 10000 = 100%)
     */
    function requestFundsFromPool(
        uint256 poolId,
        uint256 strategyId,
        address assetsTo,
        uint256[] calldata tokenIds,
        uint256[] calldata amountPercentages
    ) external nonReentrant returns (DepositedInfo memory) {
        if (msg.sender != elizia) {
            revert Unauthorized();
        }
        
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
        
        emit FundsRequested(
            poolId,
            strategyId,
            assetsTo,
            result.amount,
            depositId - 1
        );
        
        return result;
    }

    // Internal functions
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _assertStrategyExists(uint256 strategyId) internal view {
        if (!strategyInfo[strategyId].isRegistered) {
            revert StrategyNotFound();
        }
    }

    function _executeSwap(
        uint256[] memory amounts,
        address[] memory assets,
        address assetTo
    ) internal returns (uint256) {
        require(assets.length > 0, "Empty assets array");
        require(amounts.length > 0, "Empty amounts array");
        require(assets.length == amounts.length, "Length mismatch");
        
        uint256 totalAmount = 0;
        
        for (uint256 i = 0; i < assets.length; i++) {
            address currentAsset = assets[i];
            uint256 currentAmount = amounts[i];
            
            if (currentAmount == 0) {
                continue;
            }
            
            if (currentAsset == assetTo) {
                totalAmount += currentAmount;
            } else {
                uint256 swappedAmount = _uniswapSwap(currentAsset, assetTo, currentAmount);
                totalAmount += swappedAmount;
            }
        }
        
        return totalAmount;
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
        
        _assertStrategyExists(strategyId);
        
        StrategyInfo memory strategy = strategyInfo[strategyId];
        
        // Calculate actual amounts to request based on percentages
        uint256[] memory requestAmounts = new uint256[](tokenIds.length);
        IPoolManager poolManager = IPoolManager(poolAddress);
        
        // Get pool information to calculate amounts
        (,, uint256[] memory totalAssets, uint256[] memory allocatedToStrategy) = 
            poolManager.getAllTokensInfo();
            
        // Calculate request amounts based on percentages
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            if (tokenId > totalAssets.length) continue;
            
            uint256 availableAssets = totalAssets[tokenId - 1] - allocatedToStrategy[tokenId - 1];
            requestAmounts[i] = (availableAssets * amountPercentages[i]) / 10000; // Convert basis points to percentage
        }
        
        // Request funds from pool using batch function
        bool[] memory results = poolManager.provideBatchFundsToStrategy(tokenIds, requestAmounts);
        
        // Build arrays of actual received assets and amounts 
        uint256 validResultCount = 0;
        for (uint256 i = 0; i < results.length; i++) {
            if (results[i]) validResultCount++;
        }
        
        uint256[] memory receivedAmounts = new uint256[](validResultCount);
        address[] memory receivedAssets = new address[](validResultCount);
        
        uint256 validIndex = 0;
        for (uint256 i = 0; i < results.length; i++) {
            if (results[i]) {
                receivedAmounts[validIndex] = requestAmounts[i];
                receivedAssets[validIndex] = poolManager.asset(tokenIds[i]);
                validIndex++;
            }
        }
        
        // Swap all assets to target asset
        uint256 totalAmount = _executeSwap(receivedAmounts, receivedAssets, assetTo);
        
        // If we received any assets, forward them to the strategy
        if (totalAmount > 0) {
            // Approve strategy to spend the swapped tokens
            IERC20(assetTo).approve(strategy.strategyAddress, totalAmount);
            
            // Call strategy's deposit function
            (bool success,) = strategy.strategyAddress.call(
                abi.encodeWithSelector(strategy.depositSelector, totalAmount, assetTo)
            );
            
            if (!success) revert StrategyCallFailed();
        }
        
        // Store deposit info
        uint256 currentDepositId = depositId;
        
        DepositedInfo memory depositInfo = DepositedInfo({
            amount: totalAmount,
            asset: assetTo,
            timestamp: block.timestamp,
            amounts: receivedAmounts,
            assets: receivedAssets
        });
        
        depositedInfo[currentDepositId] = depositInfo;
        depositId = currentDepositId + 1;
        
        return depositInfo;
    }

    function _uniswapSwap(
        address assetFrom,
        address assetTo,
        uint256 amountIn
    ) internal returns (uint256) {
        if (assetFrom == assetTo) {
            return amountIn;
        }
        
        // Approve Uniswap router to spend tokens
        IERC20(assetFrom).approve(uniswapRouter, amountIn);
        
        // Create the params for the swap
        ISwapRouter router = ISwapRouter(uniswapRouter);
        uint24 fee = 3000; // Default fee tier (0.3%)
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: assetFrom,
            tokenOut: assetTo,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp + 100,
            amountIn: amountIn,
            amountOutMinimum: 0, // No slippage protection for simplicity (should be improved in production)
            sqrtPriceLimitX96: 0 // No price limit
        });
        
        // Execute the swap
        uint256 amountOut = router.exactInputSingle(params);
        return amountOut;
    }
    
    /**
     * @dev Return funds from strategy to pool in a batch operation
     * @param poolId ID of the pool to return funds to
     * @param strategyId ID of the strategy to withdraw from
     * @param amounts Amounts to withdraw for each token
     * @param tokenIds Array of token IDs to return to the pool
     */
    function returnFundsToPool(
        uint256 poolId,
        uint256 strategyId,
        uint256[] calldata amounts,
        uint256[] calldata tokenIds
    ) external nonReentrant onlyOwner returns (bool[] memory) {
        if (tokenIds.length != amounts.length) {
            revert ArrayLengthMismatch();
        }
        
        address poolAddress = poolInfo[poolId];
        if (poolAddress == address(0)) {
            revert StrategyNotFound();
        }
        
        _assertStrategyExists(strategyId);
        StrategyInfo memory strategy = strategyInfo[strategyId];
        
        // Get assets for the token IDs
        IPoolManager poolManager = IPoolManager(poolAddress);
        address[] memory assets = new address[](tokenIds.length);
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            assets[i] = poolManager.asset(tokenIds[i]);
        }
        
        // Call strategy's withdraw function for each asset
        for (uint256 i = 0; i < assets.length; i++) {
            if (amounts[i] == 0) continue;
            
            // Call strategy withdraw function
            (bool success,) = strategy.strategyAddress.call(
                abi.encodeWithSelector(strategy.withdrawSelector, amounts[i], assets[i])
            );
            
            if (!success) {
                // Strategy withdrawal failed, skip this token
                continue;
            }
            
            // Approve pool to spend the tokens
            IERC20(assets[i]).approve(poolAddress, amounts[i]);
        }
        
        // Transfer assets back to pool
        bool[] memory results = poolManager.receiveBatchFundsFromStrategy(tokenIds, amounts);
        
        return results;
    }
}