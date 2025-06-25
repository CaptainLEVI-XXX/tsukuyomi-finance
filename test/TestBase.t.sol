// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {PoolManager} from "../src/PoolManager.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {MultiAssetVault} from "../src/MultiAssetVault.sol";
import {PriceFeedConsumer} from "../src/PriceFeedConsumer.sol";
import {AAVEIntegration} from "../src/integration/AAVE.sol";
import {MorphoIntegration} from "../src/integration/Morpho.sol";

contract TestBase is Test {
    address public owner = makeAddr("Owner");
    PoolManager public poolManager;
    CrossChainStrategyManager public crossChainStrategyManager;
    AAVEIntegration public aaveIntegration;
    MorphoIntegration public morphoIntegration;

    function setUp() public virtual {


        poolManager = new PoolManager();
        crossChainStrategyManager = new CrossChainStrategyManager();
        aaveIntegration = new AAVEIntegration();
        morphoIntegration = new MorphoIntegration();

        

    }


}
