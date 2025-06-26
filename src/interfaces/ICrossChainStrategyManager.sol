// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Cross-Chain Strategy Manager Interface
interface ICrossChainStrategyManager {
    struct StrategyInfo {
        string name;
        address strategyAddress;
        uint64 chainSelector;
        bytes4 depositSelector;
        bytes4 withdrawSelector;
        bytes4 harvestSelector;
        bytes4 balanceSelector;
        bool isActive;
        uint256 totalAllocated;
        uint256 lastUpdateTime;
    }

    struct AllocationInfo {
        uint256 strategyId;
        address asset;
        uint256 principal;
        uint256 currentValue;
        uint256 lastHarvestTime;
        bool isActive;
    }

    function investCrossChain(
        uint256 poolId,
        uint256 strategyId,
        uint256[] calldata tokenIds,
        uint256[] calldata percentages,
        address targetAsset
    ) external returns (uint256 depositId);

    function harvestYield(uint256 strategyId, address[] calldata assets) external;

    function withdrawFromStrategy(uint256 strategyId, address asset, uint256 amount, uint256 poolId) external;

    function getStrategy(uint256 strategyId) external view returns (StrategyInfo memory);
    function getAllocation(uint256 strategyId, address asset) external view returns (AllocationInfo memory);
}
