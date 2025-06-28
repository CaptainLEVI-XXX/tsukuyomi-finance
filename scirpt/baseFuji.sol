// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract BaseFujiDetails{

    address internal constant WETH_BASE= 0x84583A2211192315511356c24b187416049C9371;
    address internal constant USDC_BASE = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;
    address internal constant DAI_BASE = 0x9759A6Ac90977b93ef73198b4f889A1B7b84e917;
    address internal constant USDT_BASE = 0x9759A6Ac90977b93ef73198b4f889A1B7b84e917;
    address internal constant LINK_BASE = 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    address internal constant AAVE_POOL_BASE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant MORPHO_BLUE_BASE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant UNISWAP_ROUTER_BASE = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    address internal constant CCIP_ROUTER_BASE = 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D;

    address internal constant AGGREGATOR_ORACLE_BASE = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
    
}