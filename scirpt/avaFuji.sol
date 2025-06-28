// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract AvalancheFujiDetails{

    address internal constant WETH_AVA= 0x84583A2211192315511356c24b187416049C9371;
    address internal constant USDC_AVA = 0x5425890298aed601595a70AB815c96711a31Bc65;
    address internal constant DAI_AVA = 0x9759A6Ac90977b93ef73198b4f889A1B7b84e917;
    address internal constant USDT_AVA = 0x9759A6Ac90977b93ef73198b4f889A1B7b84e917;
    address internal constant LINK_AVA = 0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846;

    address internal constant AAVE_POOL_AVA = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant MORPHO_BLUE_AVA = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant UNISWAP_ROUTER_AVA = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    address internal constant AGGREGATOR_ORACLE_AVA = 0x514910771AF9Ca656af840dff83E8264EcF986CA;

    address internal constant CCIP_ROUTER_AVA = 0xF694E193200268f9a4868e4Aa017A0118C9a8177;
    uint64 internal constant fujiChainSelector =14767482510784806043;
    
}