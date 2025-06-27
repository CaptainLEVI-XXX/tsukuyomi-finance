// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@solady/auth/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title Chainlink Price Oracle
 * @notice Oracle implementation using Chainlink price feeds
 */
contract ChainlinkPriceOracle is Ownable {
    struct PriceFeed {
        AggregatorV3Interface feed;
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
