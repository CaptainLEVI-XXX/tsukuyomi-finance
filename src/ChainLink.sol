// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@solady/auth/Ownable.sol";
import {IAggregatorV3Interface} from "./interfaces/IAggregatorV3Interface.sol";

/**
 * @title Chainlink Price Oracle
 * @notice Oracle implementation using Chainlink price feeds
 */
contract ChainlinkPriceOracle is Ownable {
    struct PriceFeed {
        IAggregatorV3Interface feed;
        uint256 heartbeat; // Maximum acceptable time between updates (seconds)
        bool isActive;
    }

    mapping(address asset => PriceFeed) public priceFeeds;
    mapping(address asset => uint256 fallbackPrice) public fallbackPrices;

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant MAX_PRICE_AGE = 3600; // 1 hour default

    event PriceFeedAdded(address indexed asset, address indexed feed, uint256 heartbeat);
    event PriceFeedUpdated(address indexed asset, address indexed feed, uint256 heartbeat);
    event FallbackPriceSet(address indexed asset, uint256 price);

    error InvalidPriceFeed();
    error StalePrice();
    error InvalidPrice();
    error AssetNotSupported();

    constructor(address _owner) {
        _initializeOwner(_owner);
    }

    /**
     * @notice Add a new price feed for an asset
     * @param asset The asset address
     * @param feed The Chainlink aggregator address
     * @param heartbeat Maximum acceptable time between updates
     */
    function addPriceFeed(address asset, address feed, uint256 heartbeat) external onlyOwner {
        if (asset == address(0) || feed == address(0)) revert InvalidPriceFeed();

        priceFeeds[asset] = PriceFeed({
            feed: AggregatorV3Interface(feed),
            heartbeat: heartbeat > 0 ? heartbeat : MAX_PRICE_AGE,
            isActive: true
        });

        emit PriceFeedAdded(asset, feed, heartbeat);
    }

    /**
     * @notice Update an existing price feed
     */
    function updatePriceFeed(address asset, address feed, uint256 heartbeat) external onlyOwner {
        if (!priceFeeds[asset].isActive) revert AssetNotSupported();

        priceFeeds[asset].feed = AggregatorV3Interface(feed);
        priceFeeds[asset].heartbeat = heartbeat > 0 ? heartbeat : MAX_PRICE_AGE;

        emit PriceFeedUpdated(asset, feed, heartbeat);
    }

    /**
     * @notice Set fallback price for an asset (emergency use)
     */
    function setFallbackPrice(address asset, uint256 price) external onlyOwner {
        fallbackPrices[asset] = price;
        emit FallbackPriceSet(asset, price);
    }

    /**
     * @notice Get the latest price for an asset
     * @param asset The asset address
     * @return price The price with 18 decimals
     * @return decimals The number of decimals (always 18)
     */
    function getPrice(address asset) external view returns (uint256 price, uint8 decimals) {
        PriceFeed memory feed = priceFeeds[asset];
        if (!feed.isActive) revert AssetNotSupported();

        try feed.feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            // Check if price is stale
            if (block.timestamp - updatedAt > feed.heartbeat) {
                // Use fallback price if available
                if (fallbackPrices[asset] > 0) {
                    return (fallbackPrices[asset], 18);
                }
                revert StalePrice();
            }

            if (answer <= 0) revert InvalidPrice();

            // Convert to 18 decimals
            uint8 feedDecimals = feed.feed.decimals();
            if (feedDecimals < 18) {
                price = uint256(answer) * (10 ** (18 - feedDecimals));
            } else if (feedDecimals > 18) {
                price = uint256(answer) / (10 ** (feedDecimals - 18));
            } else {
                price = uint256(answer);
            }

            return (price, 18);
        } catch {
            // Use fallback price if available
            if (fallbackPrices[asset] > 0) {
                return (fallbackPrices[asset], 18);
            }
            revert InvalidPriceFeed();
        }
    }

    /**
     * @notice Get price in USD (same as getPrice for this implementation)
     */
    function getPriceInUSD(address asset) external view returns (uint256 priceInUSD) {
        (priceInUSD,) = this.getPrice(asset);
        return priceInUSD;
    }

    /**
     * @notice Check if an asset has a price feed
     */
    function hasPriceFeed(address asset) external view returns (bool) {
        return priceFeeds[asset].isActive;
    }

    /**
     * @notice Disable a price feed
     */
    function disablePriceFeed(address asset) external onlyOwner {
        priceFeeds[asset].isActive = false;
    }
}

// /**
//  * @title Mock Price Oracle
//  * @notice Simple oracle for testing with manually set prices
//  */
// contract MockPriceOracle is Ownable {

//     mapping(address asset => uint256 price) public prices;
//     mapping(address asset => bool) public isSupported;

//     event PriceUpdated(address indexed asset, uint256 price);

//     error AssetNotSupported();

//     constructor(address _owner) {
//         _initializeOwner(_owner);
//     }

//     function setPrice(address asset, uint256 price) external onlyOwner {
//         prices[asset] = price;
//         isSupported[asset] = true;
//         emit PriceUpdated(asset, price);
//     }

//     function getPrice(address asset) external view returns (uint256 price, uint8 decimals) {
//         if (!isSupported[asset]) revert AssetNotSupported();
//         return (prices[asset], 18);
//     }

//     function getPriceInUSD(address asset) external view returns (uint256 priceInUSD) {
//         if (!isSupported[asset]) revert AssetNotSupported();
//         return prices[asset];
//     }
// }

// /**
//  * @title Multi-Source Price Oracle
//  * @notice Oracle that aggregates prices from multiple sources
//  */
// contract MultiSourcePriceOracle is Ownable {

//     struct OracleSource {
//         address oracle;
//         uint256 weight; // Weight in basis points (10000 = 100%)
//         bool isActive;
//     }

//     mapping(address asset => OracleSource[]) public oracleSources;
//     mapping(address asset => bool) public supportedAssets;

//     uint256 public constant MAX_DEVIATION = 500; // 5% max deviation between sources

//     event OracleSourceAdded(address indexed asset, address indexed oracle, uint256 weight);
//     event PriceAggregated(address indexed asset, uint256 finalPrice, uint256 sourceCount);

//     error AssetNotSupported();
//     error PriceDeviationTooHigh();
//     error NoActiveSources();
//     error InvalidWeight();

//     constructor(address _owner) {
//         _initializeOwner(_owner);
//     }

//     function addOracleSource(
//         address asset,
//         address oracle,
//         uint256 weight
//     ) external onlyOwner {
//         if (weight == 0 || weight > 10000) revert InvalidWeight();

//         oracleSources[asset].push(OracleSource({
//             oracle: oracle,
//             weight: weight,
//             isActive: true
//         }));

//         supportedAssets[asset] = true;

//         emit OracleSourceAdded(asset, oracle, weight);
//     }

//     function getPrice(address asset) external view returns (uint256 price, uint8 decimals) {
//         if (!supportedAssets[asset]) revert AssetNotSupported();

//         OracleSource[] memory sources = oracleSources[asset];
//         uint256 weightedSum = 0;
//         uint256 totalWeight = 0;
//         uint256 activeSourceCount = 0;

//         for (uint256 i = 0; i < sources.length; i++) {
//             if (!sources[i].isActive) continue;

//             try IPriceOracle(sources[i].oracle).getPrice(asset) returns (uint256 sourcePrice, uint8) {
//                 weightedSum += sourcePrice * sources[i].weight;
//                 totalWeight += sources[i].weight;
//                 activeSourceCount++;
//             } catch {
//                 // Skip failed oracle
//                 continue;
//             }
//         }

//         if (activeSourceCount == 0) revert NoActiveSources();

//         price = weightedSum / totalWeight;

//         emit PriceAggregated(asset, price, activeSourceCount);

//         return (price, 18);
//     }

//     function getPriceInUSD(address asset) external view returns (uint256 priceInUSD) {
//         (priceInUSD,) = this.getPrice(asset);
//         return priceInUSD;
//     }
// }
