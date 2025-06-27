// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {PoolManager} from "../PoolManager.sol";

// Pool Manager Interface
interface IPoolManager {
    function assets(uint256 tokenId) external view returns (PoolManager.AssetInfo memory);
    function getAvailableLiquidity(uint256 tokenId) external view returns (uint256);
    function allocateToStrategy(uint256 tokenId, uint256 amount) external;
    function returnFromStrategy(uint256 tokenId, uint256 principal, uint256 yield) external;
    function getAllTokensInfo()
        external
        view
        returns (
            address[] memory assetAddresses,
            string[] memory names,
            uint256[] memory totalAssets,
            uint256[] memory allocatedToStrategy
        );
    function provideBatchFundsToStrategy(uint256[] calldata tokenIds, uint256[] calldata amounts)
        external
        returns (bool[] memory);
    function receiveBatchFundsFromStrategy(uint256[] calldata tokenIds, uint256[] calldata amounts)
        external
        returns (bool[] memory);
    function asset(uint256 id) external view returns (address);
}
