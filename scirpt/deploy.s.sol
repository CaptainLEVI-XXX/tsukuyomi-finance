// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {AvalancheFujiDetails} from "./avaFuji.sol";
import {BaseFujiDetails} from "./baseFuji.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {ChainlinkPriceOracle} from "../src/PriceOracle.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {AaveIntegration} from "../src/integration/AAVE.sol";

contract DeployScript is Script {


    address internal constant owner =address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);
    address internal constant controller = address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);

    
    
    PoolManager internal lowRiskPoolManagerOnFuji;
    PoolManager internal highRiskPoolManagerOnFuji;
    PoolManager internal mediumRiskPoolManagerOnFuji;


    PoolManager internal lowRiskPoolManagerOnBase;
    PoolManager internal highRiskPoolManagerOnBase;
    PoolManager internal mediumRiskPoolManagerOnBase;

    CrossChainStrategyManager internal strategyManagerOnFuji;
    CrossChainStrategyManager internal strategyManagerOnBase;

    ChainlinkPriceOracle internal priceOracleOnFuji;
    ChainlinkPriceOracle internal priceOracleOnBase;
    

    

    
    function run() public {
        vm.startBroadcast();
        _deployAndSetPoolManager();
        vm.stopBroadcast();
    }

    function _deployPriceOracle() internal {
        priceOracleOnFuji = new ChainlinkPriceOracle(owner);
    }

    function _deployStrategyManager() internal {
        
        strategyManagerOnFuji = new CrossChainStrategyManager();

        bytes memory data  =  abi.encodeWithSelector(CrossChainStrategyManager.initialize.selector, owner, controller, CCIP_ROUTER_AVA, LINK_AVA, fujiChainSelector);

        ERC1967Proxy strategyManagerOnFujiProxy = new ERC1967Proxy(address(strategyManagerOnFuji), data);

        strategyManagerOnFuji = CrossChainStrategyManager(address(strategyManagerOnFujiProxy));

    }

    function _deployAndSetPoolManager() internal {

        lowRiskPoolManagerOnFuji = new PoolManager();
        highRiskPoolManagerOnFuji = new PoolManager();
        mediumRiskPoolManagerOnFuji = new PoolManager();

        bytes memory poolManagerOnFujiData = abi.encodeWithSelector(PoolManager.initialize.selector, owner, address(strategyManagerOnFuji), address(priceOracleOnFuji));

        ERC1967Proxy lowRiskPoolManagerOnFujiProxy = new ERC1967Proxy(address(lowRiskPoolManagerOnFuji), poolManagerOnFujiData);
        ERC1967Proxy highRiskPoolManagerOnFujiProxy = new ERC1967Proxy(address(highRiskPoolManagerOnFuji), poolManagerOnFujiData);
        ERC1967Proxy mediumRiskPoolManagerOnFujiProxy = new ERC1967Proxy(address(mediumRiskPoolManagerOnFuji), poolManagerOnFujiData);

        lowRiskPoolManagerOnFuji = PoolManager(address(lowRiskPoolManagerOnFujiProxy));
        highRiskPoolManagerOnFuji = PoolManager(address(highRiskPoolManagerOnFujiProxy));
        mediumRiskPoolManagerOnFuji = PoolManager(address(mediumRiskPoolManagerOnFujiProxy));

    }

}