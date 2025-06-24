// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoolManager {
    function provideBatchFundsToStrategy(uint256[] calldata tokenIds, uint256[] calldata amounts) 
        external returns (bool[] memory results);
    
    function receiveBatchFundsFromStrategy(uint256[] calldata tokenIds, uint256[] calldata amounts) 
        external returns (bool[] memory results);
    
    function getRegisteredAssets() external view returns (uint256[] memory tokenIds, address[] memory assets);
    
    function getAllTokensInfo() external view returns(
        uint256[] memory tokenIds,
        address[] memory assets,
        uint256[] memory totalAssetsInPool,
        uint256[] memory allocatedToStrategy
    );
    
    function asset(uint256 tokenId) external view returns (address);
}