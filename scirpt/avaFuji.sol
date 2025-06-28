// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract AvalancheFujiDetails{


    address internal constant USDC_AVA = 0x5425890298aed601595a70AB815c96711a31Bc65;
    address internal constant LINK_AVA = 0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846;

    address internal constant AGGREGATOR_ORACLE_AVA = 0x5498BB86BC934c8D34FDA08E81D444153d0D06aD;

    address internal constant CCIP_ROUTER_AVA = 0xF694E193200268f9a4868e4Aa017A0118C9a8177;
    uint64 internal constant fujiChainSelector =14767482510784806043;

    address internal constant UNISWAP_ROUTER_AVA = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    
}