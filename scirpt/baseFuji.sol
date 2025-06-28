// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract BaseFujiDetails{


    address internal constant AAVE_POOL_BASE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant MORPHO_BLUE_BASE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;

    address internal constant CCIP_ROUTER_BASE = 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D;

    address internal constant AGGREGATOR_ORACLE_BASE = 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    uint64 internal constant baseChainSelector =15971525489660198786;

    
    // Chain-specific addresses
    address public LINK_BASE = 0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196;
    address public UNISWAP_ROUTER_BASE = 0x2626664c2603336E57B271c5C0b26F421741e481; // Correct Base Uniswap V3 Router
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
}