// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {AvalancheFujiDetails} from "./avaFuji.sol";
import {BaseFujiDetails} from "./baseFuji.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {ChainlinkPriceOracle} from "../src/PriceOracle.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {AaveV3Integration} from "../src/integration/AAVE.sol";

contract DeployScript is Script,BaseFujiDetails {


    address internal constant owner =address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);
    address internal constant controller = address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);

    address internal  USDC_AVA = 0x5425890298aed601595a70AB815c96711a31Bc65;
    address internal  LINK_AVA = 0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846;

    address internal  AGGREGATOR_ORACLE_AVA = 0x5498BB86BC934c8D34FDA08E81D444153d0D06aD;

    address internal  CCIP_ROUTER_AVA = 0xF694E193200268f9a4868e4Aa017A0118C9a8177;
    uint64 internal  fujiChainSelector =14767482510784806043;
    address internal  UNISWAP_ROUTER_AVA = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    
    
    PoolManager internal lowRiskPoolManagerOnFuji;
    PoolManager internal highRiskPoolManagerOnFuji;


    CrossChainStrategyManager internal strategyManagerOnFuji;

    ChainlinkPriceOracle internal priceOracleOnFuji;

    
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        _deployPriceOracle();
        _deployStrategyManager();
        _deployAndSetPoolManager();
        vm.stopBroadcast();
    }

    function _deployPriceOracle() internal {
        priceOracleOnFuji = new ChainlinkPriceOracle(owner);
        priceOracleOnFuji.addPriceFeed(USDC_AVA, AGGREGATOR_ORACLE_AVA, 3600); // Chainlink USDC/USD
    }

    function _deployStrategyManager() internal {
        
        strategyManagerOnFuji = new CrossChainStrategyManager();

        bytes memory data  =  abi.encodeWithSelector(CrossChainStrategyManager.initialize.selector, owner, controller, CCIP_ROUTER_AVA, LINK_AVA, fujiChainSelector);

        ERC1967Proxy strategyManagerOnFujiProxy = new ERC1967Proxy(address(strategyManagerOnFuji), data);

        strategyManagerOnFuji = CrossChainStrategyManager(address(strategyManagerOnFujiProxy));

        vm.label(address(strategyManagerOnFujiProxy),"strategyManagerOnFujiProxy");

        strategyManagerOnFuji.addChain(fujiChainSelector, address(strategyManagerOnFuji), UNISWAP_ROUTER_AVA);
        // needs to done after base is deployed
        // strategyManagerOnFuji.addChain(baseChainSelector, address(strategyManagerOnFuji), UNISWAP_ROUTER_BASE);

    }

    function _deployAndSetPoolManager() internal {

        lowRiskPoolManagerOnFuji = new PoolManager();
        highRiskPoolManagerOnFuji = new PoolManager();

        bytes memory poolManagerOnFujiData = abi.encodeWithSelector(PoolManager.initialize.selector, owner, address(strategyManagerOnFuji), address(priceOracleOnFuji));

        ERC1967Proxy lowRiskPoolManagerOnFujiProxy = new ERC1967Proxy(address(lowRiskPoolManagerOnFuji), poolManagerOnFujiData);
        ERC1967Proxy highRiskPoolManagerOnFujiProxy = new ERC1967Proxy(address(highRiskPoolManagerOnFuji), poolManagerOnFujiData);

        lowRiskPoolManagerOnFuji = PoolManager(address(lowRiskPoolManagerOnFujiProxy));
        highRiskPoolManagerOnFuji = PoolManager(address(highRiskPoolManagerOnFujiProxy));
        


        lowRiskPoolManagerOnFuji.addAsset(USDC_AVA, "Pool USDC", "pUSDC");
        highRiskPoolManagerOnFuji.addAsset(USDC_AVA, "Pool USDC", "pUSDC");
    


        strategyManagerOnFuji.addPool(address(lowRiskPoolManagerOnFuji));
        strategyManagerOnFuji.addPool(address(highRiskPoolManagerOnFuji));

        vm.label(address(lowRiskPoolManagerOnFuji),"lowRiskPoolManagerOnFuji");
        vm.label(address(highRiskPoolManagerOnFuji),"highRiskPoolManagerOnFuji");

    }

    //source .env && forge script script/deploy.s.sol:DeployScript --rpc-url $FUJI_RPC_URL --broadcast


//     forge verify-contract \
// 0x81aA57736801E33f8ef059F79B8F4332416D4DB8 
//   \ src/PoolManager.sol:PoolManager \
//   --rpc-url $FUJI_RPC_URL \
//   --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan' \
//   --etherscan-api-key "verifyContract"

//  forge verify-contract \
//  0x81aA57736801E33f8ef059F79B8F4332416D4DB8 \                                 
//  src/CrossChainStrategyManager.sol:CrossChainStrategyManager \
//  --rpc-url $FUJI_RPC_URL \                                                         
//  --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan' \
//  --etherscan-api-key "verifyContract"'


//  forge verify-contract \
//  0x81aA57736801E33f8ef059F79B8F4332416D4DB8 \
//  src/CrossChainStrategyManager.sol:CrossChainStrategyManager \
//  --rpc-url $FUJI_RPC_URL \
//  --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan' \
//  --etherscan-api-key "verifyContract"

}