// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CrossChainStrategyManager} from "../src/CrossChainStrategyManager.sol";
import {ChainlinkPriceOracle} from "../src/PriceOracle.sol";
import {PoolManager} from "../src/PoolManager.sol";
import {AaveV3Integration} from "../src/integration/AAVE.sol";
import {MockStrategyIntegration} from "../test/mocks/MockStrategyIntegration.sol";

contract DeployBaseScript is Script {


    address internal constant owner =address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);
    address internal constant controller = address(0x4741b6F3CE01C4ac1C387BC9754F31c1c93866F0);

    address internal  CCIP_ROUTER_BASE = 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93;

    address internal  AGGREGATOR_ORACLE_BASE= 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    uint64 internal  baseChainSelector =10344971235874465080;

    
    // Chain-specific addresses
    address public LINK_BASE = 0xE4aB69C077896252FAFBD49EFD26B5D171A32410;
    address public UNISWAP_ROUTER_BASE = 0x2626664c2603336E57B271c5C0b26F421741e481; // Correct Base Uniswap V3 Router
    address public BASE_USDC = 0xcBA01C75D035ca98FfC7710DAe710435CA53c03C;

    
    
    PoolManager internal lowRiskPoolManagerOnBase;
    PoolManager internal highRiskPoolManagerOnBase;

    MockStrategyIntegration internal mockStrategyIntegration;

    CrossChainStrategyManager internal strategyManagerOnBase;

    // ChainlinkPriceOracle internal priceOracleOnBase ;

    
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        // _deployPriceOracle();
        _deployStrategyManager();
        _deployMockStrategyIntegration();
        _deployAndSetPoolManager();
        vm.stopBroadcast();
    }

    // function _deployPriceOracle() internal {
    //     priceOracleOnBase = new ChainlinkPriceOracle(owner);
    //     priceOracleOnBase.addPriceFeed(BASE_USDC, AGGREGATOR_ORACLE_BASE, 3600); // Chainlink USDC/USD
    // }

    function _deployStrategyManager() internal {
        
        strategyManagerOnBase = new CrossChainStrategyManager();

        bytes memory data  =  abi.encodeWithSelector(CrossChainStrategyManager.initialize.selector, owner, controller, CCIP_ROUTER_BASE, LINK_BASE, baseChainSelector);

        ERC1967Proxy strategyManagerOnBaseProxy = new ERC1967Proxy(address(strategyManagerOnBase), data);

        strategyManagerOnBase = CrossChainStrategyManager(address(strategyManagerOnBaseProxy));

        vm.label(address(strategyManagerOnBaseProxy),"strategyManagerOnBaseProxy");

        strategyManagerOnBase.addChain(baseChainSelector, address(strategyManagerOnBase), UNISWAP_ROUTER_BASE);
        // needs to done after base is deployed
        // strategyManagerOnFuji.addChain(baseChainSelector, address(strategyManagerOnFuji), UNISWAP_ROUTER_BASE);

    }

    function _deployMockStrategyIntegration() internal {
        mockStrategyIntegration = new MockStrategyIntegration(address(strategyManagerOnBase), "MockStrategyIntegration");
        // Register AAVE strategy
        bytes4[3] memory aaveSelectors =
            [mockStrategyIntegration.deposit.selector, mockStrategyIntegration.withdraw.selector, mockStrategyIntegration.getBalance.selector];

        strategyManagerOnBase.registerStrategy(
            "MockStrategyIntegration", address(mockStrategyIntegration), baseChainSelector, aaveSelectors
        );

    }

    function _deployAndSetPoolManager() internal {

        lowRiskPoolManagerOnBase = new PoolManager();
        highRiskPoolManagerOnBase = new PoolManager();

        bytes memory poolManagerOnBaseData = abi.encodeWithSelector(PoolManager.initialize.selector, owner, address(strategyManagerOnBase), owner);

        ERC1967Proxy lowRiskPoolManagerOnBaseProxy = new ERC1967Proxy(address(lowRiskPoolManagerOnBase), poolManagerOnBaseData);
        ERC1967Proxy highRiskPoolManagerOnBaseProxy = new ERC1967Proxy(address(highRiskPoolManagerOnBase), poolManagerOnBaseData);

        lowRiskPoolManagerOnBase = PoolManager(address(lowRiskPoolManagerOnBaseProxy));
        highRiskPoolManagerOnBase = PoolManager(address(highRiskPoolManagerOnBaseProxy));
        


        lowRiskPoolManagerOnBase.addAsset(BASE_USDC, "Pool USDC", "pUSDC");
        highRiskPoolManagerOnBase.addAsset(BASE_USDC, "Pool USDC", "pUSDC");
    


        strategyManagerOnBase.addPool(address(lowRiskPoolManagerOnBase));
        strategyManagerOnBase.addPool(address(highRiskPoolManagerOnBase));

        vm.label(address(lowRiskPoolManagerOnBase),"lowRiskPoolManagerOnBase");
        vm.label(address(highRiskPoolManagerOnBase),"highRiskPoolManagerOnBase");

    }

    // source .env && forge script script/baseDeploy.s.sol:DeployBaseScript --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify -vvvv

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