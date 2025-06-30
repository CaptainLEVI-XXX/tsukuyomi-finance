// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UUPSUpgradeable} from "@solady/utils/UUPSUpgradeable.sol";
import {Ownable} from "@solady/auth/Ownable.sol";
import {Initializable} from "@solady/utils/Initializable.sol";
import {IPoolManager} from "./interfaces/IPoolManager.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";
// import {console} from "forge-std/console.sol";
import {CustomRevert} from "./libraries/CustomRevert.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";
import {CrossChainStrategyManagerStorage} from "./storage/CrossChainStrategyManager.sol";

// CCIP Interfaces
interface IRouterClient {
    function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32);

    function getFee(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        view
        returns (uint256);
}

interface IMessageReceiver {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}

interface ILinkToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

// CCIP Message Library
library Client {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    struct EVM2AnyMessage {
        bytes receiver;
        bytes data;
        EVMTokenAmount[] tokenAmounts;
        address feeToken;
        bytes extraArgs;
    }

    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender;
        bytes data;
        EVMTokenAmount[] destTokenAmounts;
    }
}

/**
 * @title CrossChainStrategyManager
 * @notice Manages investment strategies across multiple chains using CCIP
 * @dev Handles cross-chain fund allocation, strategy execution, and position tracking
 */
contract CrossChainStrategyManager is
    UUPSUpgradeable,
    Ownable,
    Initializable,
    IMessageReceiver,
    CrossChainStrategyManagerStorage
{
    using CustomRevert for bytes4;
    using SafeTransferLib for address;

    // Core components
    IRouterClient public ccipRouter;

    // ============ Constants ============

    uint256 private constant BPS_DIVISOR = 10000;
    uint256 private constant PRECISION = 1e18;

    // ============ Modifiers ============

    modifier onlyController() {
        if (msg.sender != controller && !allowedCallers[msg.sender]) UnauthorizedCaller.selector.revertWith();
        _;
    }

    modifier onlyCCIPRouter() {
        if (msg.sender != address(ccipRouter)) UnauthorizedCaller.selector.revertWith();
        _;
    }

    modifier validStrategy(uint256 strategyId) {
        if (!strategies[strategyId].isActive) StrategyNotActive.selector.revertWith();
        _;
    }

    // ============ Initialization ============

    function initialize(
        address _owner,
        address _controller,
        address _ccipRouter,
        address _linkToken,
        uint64 _currentChainSelector
    ) public initializer {
        _initializeOwner(_owner);
        controller = _controller;
        ccipRouter = IRouterClient(_ccipRouter);
        linkToken = _linkToken;
        currentChainSelector = _currentChainSelector;

        nextStrategyId = 1;
        nextPoolId = 1;
        nextDepositId = 1;

        // Set default CCIP extra args (gas limit)
        ccipExtraArgs = _buildCCIPExtraArgs(200000);
    }

    // ============ Strategy Management ============

    /**
     * @notice Register a new strategy (can be on any supported chain)
     * @param name Strategy name
     * @param strategyAddress Address of the strategy contract
     * @param chainSelector Chain where strategy is deployed
     * @param selectors Function selectors for strategy interaction
     */
    function registerStrategy(
        string calldata name,
        address strategyAddress,
        uint64 chainSelector,
        bytes4[3] calldata selectors // [deposit, withdraw, balance]
    ) external onlyOwner returns (uint256 strategyId) {
        if (!chainInfo[chainSelector].isActive) ChainNotSupported.selector.revertWith();

        strategyId = nextStrategyId++;

        strategies[strategyId] = StrategyInfo({
            name: name,
            strategyAddress: strategyAddress,
            chainSelector: chainSelector,
            depositSelector: selectors[0],
            withdrawSelector: selectors[1],
            balanceSelector: selectors[2],
            isActive: true,
            totalAllocated: 0,
            lastUpdateTime: block.timestamp
        });

        emit StrategyRegistered(strategyId, name, strategyAddress, chainSelector);
    }

    /**
     * @notice Add a supported chain
     * @param chainSelector CCIP chain selector
     * @param strategyManagerAddress Strategy manager on that chain
     * @param swapRouter Swap router address on that chain
     */
    function addChain(uint64 chainSelector, address strategyManagerAddress, address swapRouter) external onlyOwner {
        chainInfo[chainSelector] = ChainInfo({
            chainSelector: chainSelector,
            strategyManager: strategyManagerAddress,
            isActive: true,
            totalValueLocked: 0
        });

        swapRouters[chainSelector] = swapRouter;

        emit ChainAdded(chainSelector, strategyManagerAddress);
    }

    // ============ Pool Management ============

    /**
     * @notice Add a pool to the strategy manager
     * @param poolAddress Address of the pool
     * @return poolId The assigned pool ID
     */
    function addPool(address poolAddress) external onlyOwner returns (uint256 poolId) {
        if (poolAddress == address(0)) ZeroAddress.selector.revertWith();

        poolId = nextPoolId++;
        pools[poolId] = poolAddress;

        emit PoolAdded(poolId, poolAddress);
    }

    // ============ Cross-Chain Investment Functions ============

    /**
     * @notice Request and invest funds cross-chain
     * @param poolId Pool to request funds from
     * @param strategyId Strategy to invest in
     * @param tokenIds Token IDs from pool
     * @param percentages Percentage of each token to invest
     * @param targetAsset Asset to convert all funds to
     * @param targetAssetOnDestinationChain Asset to convert all funds to on destination chain
     */
    function investCrossChain(
        uint256 poolId,
        uint256 strategyId,
        uint256[] calldata tokenIds,     //[USDT,DAI,USDC]
        uint256[] calldata percentages, // [30,40,50]
        address targetAsset,             //USDC on Avalanche
        address targetAssetOnDestinationChain //USDC on Ethereum
    ) external onlyController validStrategy(strategyId) returns (uint256 depositId) {
        StrategyInfo memory strategy = strategies[strategyId];

        // Request funds from pool
        (uint256 totalAmount, address[] memory assets, uint256[] memory amounts) =
            _requestFundsFromPool(poolId, tokenIds, percentages);

        // If strategy is on current chain, invest directly
        if (strategy.chainSelector == currentChainSelector) {
            _investLocally(strategyId, targetAsset, assets, amounts, false);
            depositId = nextDepositId++;
            return depositId;
        }

        // Otherwise, prepare cross-chain transfer
        depositId = _initiateCrossChainDeposit(
            strategyId,
            targetAssetOnDestinationChain,
            totalAmount,
            assets,
            amounts,
            poolId,
            targetAssetOnDestinationChain
        );
    }

    /**
     * @notice Withdraw funds from a strategy (can be cross-chain)
     * @param strategyId Strategy to withdraw from
     * @param asset Asset to withdraw
     * @param amount Amount to withdraw
     * @param poolId Pool to return funds to
     */
    function withdrawFromStrategy(uint256 strategyId, address asset, uint256 amount, uint256 poolId)
        external
        onlyController
        validStrategy(strategyId)
    {
        StrategyInfo memory strategy = strategies[strategyId];

        if (strategy.chainSelector == currentChainSelector) {
            _withdrawLocally(strategyId, asset, amount, poolId);
        } else {
            _initiateCrossChainWithdraw(strategyId, asset, amount, poolId);
        }
    }

    // ============ CCIP Message Handling ============

    /**
     * @notice Handle incoming CCIP messages
     * @param message CCIP message
     */
    function ccipReceive(Client.Any2EVMMessage calldata message) external override onlyCCIPRouter {
        // Prevent duplicate processing
        if (processedMessages[message.messageId]) MessageAlreadyProcessed.selector.revertWith();
        processedMessages[message.messageId] = true;

        // Decode the message
        CrossChainMessage memory ccMessage = abi.decode(message.data, (CrossChainMessage));

        // Verify source chain is authorized
        if (!chainInfo[message.sourceChainSelector].isActive) InvalidSourceChain.selector.revertWith();

        emit CCIPMessageReceived(message.messageId, message.sourceChainSelector, ccMessage.messageType);

        // Route to appropriate handler
        if (ccMessage.messageType == MessageType.DepositRequest) {
            _handleDepositRequest(message, ccMessage);
        } else if (ccMessage.messageType == MessageType.WithdrawRequest) {
            _handleWithdrawRequest(message, ccMessage);
        } else if (ccMessage.messageType == MessageType.DepositConfirmation) {
            _handleDepositConfirmation(message.messageId, ccMessage);
        } else if (ccMessage.messageType == MessageType.WithdrawConfirmation) {
            _handleWithdrawConfirmation(ccMessage);
        }
    }

    // ============ Internal Functions ============

    function _requestFundsFromPool(uint256 poolId, uint256[] calldata tokenIds, uint256[] calldata percentages)
        internal
        returns (uint256 totalAmount, address[] memory assets, uint256[] memory amounts)
    {
        IPoolManager pool = IPoolManager(pools[poolId]);

        // Calculate amounts based on percentages
        amounts = new uint256[](tokenIds.length);
        assets = new address[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 available = pool.getAvailableLiquidity(tokenIds[i]);
            amounts[i] = (available * percentages[i]) / BPS_DIVISOR;
            assets[i] = pool.asset(tokenIds[i]);

            // Request funds from pool
            pool.allocateToStrategy(tokenIds[i], amounts[i]);
            totalAmount += amounts[i];
        }
    }

    function _investLocally(
        uint256 strategyId,
        address targetAsset,
        address[] memory assets,
        uint256[] memory amounts,
        bool isCrosschain
    ) internal {
        StrategyInfo storage strategy = strategies[strategyId];

        uint256 totalAmount = amounts[0];
        if (!isCrosschain) {
            totalAmount = 0;
            // Swap to target asset if needed
            totalAmount = _executeSwaps(assets, amounts, targetAsset);
        }

        // Approve and deposit
        targetAsset.safeApprove(strategy.strategyAddress, totalAmount);

        (bool success,) =
            strategy.strategyAddress.call(abi.encodeWithSelector(strategy.depositSelector, totalAmount, targetAsset));
        require(success, "Strategy deposit failed");

        // Update allocation
        _updateAllocation(strategyId, targetAsset, totalAmount, true);
    }

    function _initiateCrossChainDeposit(
        uint256 strategyId,
        address targetAsset,
        uint256 amount,
        address[] memory assets,
        uint256[] memory amounts,
        uint256 poolId,
        address targetAssetOnDestinationChain
    ) internal returns (uint256 depositId) {
        StrategyInfo memory strategy = strategies[strategyId];
        depositId = nextDepositId++;

        // Prepare cross-chain message
        CrossChainMessage memory ccMessage = CrossChainMessage({
            messageType: MessageType.DepositRequest,
            strategyId: strategyId,
            asset: targetAssetOnDestinationChain,
            amount: amount,
            poolId: poolId,
            sourceChain: currentChainSelector,
            sourceManager: address(this)
        });

        bytes memory data = abi.encode(ccMessage);

        // Prepare token amounts for CCIP
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            tokenAmounts[i] = Client.EVMTokenAmount({token: assets[i], amount: amounts[i]});

            // Approve CCIP router
            assets[i].safeApprove(address(ccipRouter), amounts[i]);
        }

        // Build CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(chainInfo[strategy.chainSelector].strategyManager),
            data: data,
            tokenAmounts: tokenAmounts,
            feeToken: linkToken,
            extraArgs: ccipExtraArgs
        });

        // Calculate and pay CCIP fee
        uint256 fee = ccipRouter.getFee(strategy.chainSelector, message);

        if (ILinkToken(linkToken).balanceOf(address(this)) < fee) InsufficientLinkBalance.selector.revertWith();

        ILinkToken(linkToken).approve(address(ccipRouter), fee);

        // Send cross-chain message
        bytes32 messageId = ccipRouter.ccipSend(strategy.chainSelector, message);

        // Store deposit info
        crossChainDeposits[messageId] = CrossChainDeposit({
            strategyId: strategyId,
            sourceChain: currentChainSelector,
            destinationChain: strategy.chainSelector,
            asset: targetAssetOnDestinationChain,
            amount: amount,
            timestamp: block.timestamp,
            ccipMessageId: messageId,
            status: DepositStatus.Pending,
            poolId: poolId
        });

        depositIdToStrategyId[depositId] = strategyId;

        emit CrossChainDepositInitiated(
            depositId,
            strategyId,
            currentChainSelector,
            strategy.chainSelector,
            targetAssetOnDestinationChain,
            amount,
            messageId
        );
        emit CCIPMessageSent(messageId, strategy.chainSelector, MessageType.DepositRequest);
    }

    function _initiateCrossChainWithdraw(uint256 strategyId, address asset, uint256 amount, uint256 poolId) internal {
        StrategyInfo memory strategy = strategies[strategyId];

        // Prepare cross-chain message
        CrossChainMessage memory ccMessage = CrossChainMessage({
            messageType: MessageType.WithdrawRequest,
            strategyId: strategyId,
            asset: asset,
            amount: amount,
            poolId: poolId,
            sourceChain: currentChainSelector,
            sourceManager: address(this)
        });

        bytes memory data = abi.encode(ccMessage);

        // No tokens sent for withdrawal request
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](0);

        // Build CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(chainInfo[strategy.chainSelector].strategyManager),
            data: data,
            tokenAmounts: tokenAmounts,
            feeToken: linkToken,
            extraArgs: ccipExtraArgs
        });

        // Calculate and pay CCIP fee
        uint256 fee = ccipRouter.getFee(strategy.chainSelector, message);
        ILinkToken(linkToken).approve(address(ccipRouter), fee);

        // Send message
        bytes32 messageId = ccipRouter.ccipSend(strategy.chainSelector, message);

        emit CrossChainWithdrawInitiated(strategyId, asset, amount, messageId);
        emit CCIPMessageSent(messageId, strategy.chainSelector, MessageType.WithdrawRequest);
    }

    function _handleDepositRequest(Client.Any2EVMMessage calldata message, CrossChainMessage memory ccMessage)
        internal
    {
        // Execute deposit on this chain
        address[] memory assets = new address[](message.destTokenAmounts.length);
        uint256[] memory amounts = new uint256[](message.destTokenAmounts.length);

        for (uint256 i = 0; i < message.destTokenAmounts.length; i++) {
            assets[i] = message.destTokenAmounts[i].token;
            amounts[i] = message.destTokenAmounts[i].amount;
        }

        // Invest locally
        _investLocally(ccMessage.strategyId, ccMessage.asset, assets, amounts, true);

        // Send confirmation back to source chain
        _sendDepositConfirmation(
            ccMessage.sourceChain,
            ccMessage.sourceManager,
            message.messageId,
            ccMessage.strategyId,
            ccMessage.asset,
            ccMessage.amount
        );
    }

    function _handleWithdrawRequest(Client.Any2EVMMessage calldata message, CrossChainMessage memory ccMessage)
        internal
    {
        // Withdraw from local strategy
        StrategyInfo memory strategy = strategies[ccMessage.strategyId];

        // Call strategy withdraw
        (bool success, bytes memory result) = strategy.strategyAddress.call(
            abi.encodeWithSelector(strategy.withdrawSelector, ccMessage.amount, ccMessage.asset)
        );
        require(success, "Strategy withdrawal failed");

        uint256 withdrawnAmount = abi.decode(result, (uint256));

        // Update allocation
        _updateAllocation(ccMessage.strategyId, ccMessage.asset, withdrawnAmount, false);

        // Send funds back to source chain
        _sendWithdrawnFunds(
            ccMessage.sourceChain,
            ccMessage.sourceManager,
            ccMessage.asset,
            withdrawnAmount,
            ccMessage.poolId,
            ccMessage.strategyId
        );
    }

    function _sendDepositConfirmation(
        uint64 destinationChain,
        address destinationManager,
        bytes32 originalMessageId,
        uint256 strategyId,
        address asset,
        uint256 amount
    ) internal {
        CrossChainMessage memory ccMessage = CrossChainMessage({
            messageType: MessageType.DepositConfirmation,
            strategyId: strategyId,
            asset: asset,
            amount: amount,
            poolId: 0,
            sourceChain: currentChainSelector,
            sourceManager: address(this)
        });

        bytes memory data = abi.encode(ccMessage);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationManager),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: linkToken,
            extraArgs: ccipExtraArgs
        });

        uint256 fee = ccipRouter.getFee(destinationChain, message);
        ILinkToken(linkToken).approve(address(ccipRouter), fee);

        bytes32 messageId = ccipRouter.ccipSend(destinationChain, message);
        emit CCIPMessageSent(messageId, destinationChain, MessageType.DepositConfirmation);
    }

    function _sendWithdrawnFunds(
        uint64 destinationChain,
        address destinationManager,
        address asset,
        uint256 amount,
        uint256 poolId,
        uint256 strategyId
    ) internal {
        // Prepare message
        CrossChainMessage memory ccMessage = CrossChainMessage({
            messageType: MessageType.WithdrawConfirmation,
            strategyId: strategyId,
            asset: asset,
            amount: amount,
            poolId: poolId,
            sourceChain: currentChainSelector,
            sourceManager: address(this)
        });

        bytes memory data = abi.encode(ccMessage);

        // Prepare token transfer
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({token: asset, amount: amount});

        // Approve CCIP router
        asset.safeApprove(address(ccipRouter), amount);

        // Build message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationManager),
            data: data,
            tokenAmounts: tokenAmounts,
            feeToken: linkToken,
            extraArgs: ccipExtraArgs
        });

        uint256 fee = ccipRouter.getFee(destinationChain, message);
        ILinkToken(linkToken).approve(address(ccipRouter), fee);

        bytes32 messageId = ccipRouter.ccipSend(destinationChain, message);
        emit CCIPMessageSent(messageId, destinationChain, MessageType.WithdrawConfirmation);
    }

    function _handleDepositConfirmation(bytes32 originalMessageId, CrossChainMessage memory ccMessage) internal {
        // Update deposit status
        CrossChainDeposit storage deposit = crossChainDeposits[originalMessageId];
        deposit.status = DepositStatus.Completed;

        // Update allocation on source chain
        _updateAllocation(ccMessage.strategyId, ccMessage.asset, ccMessage.amount, true);

        emit CrossChainDepositCompleted(0, ccMessage.strategyId, ccMessage.amount);
    }

    function _handleWithdrawConfirmation(CrossChainMessage memory ccMessage) internal {
        // Return funds to pool
        IPoolManager pool = IPoolManager(pools[ccMessage.poolId]);
        ccMessage.asset.safeApprove(address(pool), ccMessage.amount);

        // Find token ID for asset
        uint256 tokenId = _getTokenIdForAsset(ccMessage.poolId, ccMessage.asset);
        pool.returnFromStrategy(tokenId, ccMessage.amount, 0);

        emit CrossChainWithdrawCompleted(ccMessage.strategyId, ccMessage.asset, ccMessage.amount, ccMessage.poolId);
    }

    function _updateAllocation(uint256 strategyId, address asset, uint256 amount, bool isDeposit) internal {
        AllocationInfo storage allocation = allocations[strategyId][asset];

        if (isDeposit) {
            allocation.principal += amount;
            allocation.currentValue += amount;
            strategies[strategyId].totalAllocated += amount;
        } else {
            // For withdrawals
            uint256 withdrawRatio = (amount * PRECISION) / allocation.currentValue;
            uint256 principalReduction = (allocation.principal * withdrawRatio) / PRECISION;

            allocation.principal -= principalReduction;
            allocation.currentValue -= amount;
            strategies[strategyId].totalAllocated -= amount;
        }

        allocation.isActive = allocation.principal > 0;
        strategies[strategyId].lastUpdateTime = block.timestamp;

        emit AllocationUpdated(strategyId, asset, allocation.principal, allocation.currentValue);
    }

    function _executeSwaps(address[] memory assets, uint256[] memory amounts, address targetAsset)
        internal
        returns (uint256 totalAmount)
    {
        ISwapRouter router = ISwapRouter(swapRouters[currentChainSelector]);

        for (uint256 i = 0; i < assets.length; i++) {
            if (assets[i] == targetAsset) {
                totalAmount += amounts[i];
            } else {
                assets[i].safeApprove(address(router), amounts[i]);

                ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                    tokenIn: assets[i],
                    tokenOut: targetAsset,
                    fee: 3000,
                    recipient: address(this),
                    deadline: block.timestamp + 100,
                    amountIn: amounts[i],
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

                totalAmount += router.exactInputSingle(params);
            }
        }
    }

    function _withdrawLocally(uint256 strategyId, address asset, uint256 amount, uint256 poolId) internal {
        StrategyInfo memory strategy = strategies[strategyId];

        // Call strategy withdraw
        (bool success,) =
            strategy.strategyAddress.call(abi.encodeWithSelector(strategy.withdrawSelector, amount, asset));
        require(success, "Strategy withdrawal failed");

        // Update allocation
        _updateAllocation(strategyId, asset, amount, false);

        // Return to pool
        IPoolManager pool = IPoolManager(pools[poolId]);
        asset.safeApprove(address(pool), amount);

        uint256 tokenId = _getTokenIdForAsset(poolId, asset);
        pool.returnFromStrategy(tokenId, amount, 0);
    }

    function _getPoolTotalValue(uint256 poolId) internal view returns (uint256) {
        // Simplified - would calculate total pool value
        return 0;
    }

    function _getTokenIdForAsset(uint256 poolId, address asset) internal view returns (uint256) {
        IPoolManager pool = IPoolManager(pools[poolId]);
        return pool.getTokenIdForAsset(asset);
    }

    function _buildCCIPExtraArgs(uint256 gasLimit) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(keccak256("CCIP EVMExtraArgsV1")), gasLimit, false);
    }

    // ============ View Functions ============

    function getStrategy(uint256 strategyId) external view returns (StrategyInfo memory) {
        return strategies[strategyId];
    }

    function getAllocation(uint256 strategyId, address asset) external view returns (AllocationInfo memory) {
        return allocations[strategyId][asset];
    }

    function getChainInfo(uint64 chainSelector) external view returns (ChainInfo memory) {
        return chainInfo[chainSelector];
    }

    function getCrossChainDeposit(bytes32 messageId) external view returns (CrossChainDeposit memory) {
        return crossChainDeposits[messageId];
    }

    function getTotalValueLocked() external view returns (uint256 total) {
        for (uint64 chainSelector = 1; chainSelector <= 20; chainSelector++) {
            if (chainInfo[chainSelector].isActive) {
                total += chainInfo[chainSelector].totalValueLocked;
            }
        }
    }

    // ============ Admin Functions ============

    function updateController(address newController) external onlyOwner {
        controller = newController;
    }

    function setAllowedCaller(address caller, bool allowed) external onlyOwner {
        allowedCallers[caller] = allowed;
    }

    function pauseStrategy(uint256 strategyId) external onlyOwner {
        strategies[strategyId].isActive = false;
    }

    function updateMaxAllocation(uint256 newMax) external onlyOwner {
        require(newMax <= BPS_DIVISOR, "Invalid max");
        maxAllocationPerStrategy = newMax;
    }

    function updateCCIPGasLimit(uint256 newGasLimit) external onlyOwner {
        require(newGasLimit <= maxCrossChainGasLimit, "Gas limit too high");
        ccipExtraArgs = _buildCCIPExtraArgs(newGasLimit);
    }

    function fundWithLink(uint256 amount) external {
        linkToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function emergencyWithdraw(uint256 strategyId, address asset) external onlyOwner {
        // Emergency withdrawal logic
        emit EmergencyWithdrawal(strategyId, asset, 0);
    }

    // ============ UUPS Functions ============

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
