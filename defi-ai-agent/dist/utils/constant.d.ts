export declare const STRATEGY_MAPPING: {
    readonly Aave: 1;
    readonly Compound: 2;
    readonly Curve: 3;
    readonly Uniswap: 4;
    readonly Balancer: 5;
    readonly Yearn: 6;
    readonly Convex: 7;
    readonly Lido: 8;
    readonly 'Rocket Pool': 9;
    readonly Frax: 10;
};
export declare const RISK_PROFILES: {
    LOW: {
        maxRiskScore: number;
        minTVL: number;
        minProtocolAge: number;
        maxAllocationPerProtocol: number;
        allowedPoolTypes: string[];
        preferredProtocols: string[];
    };
    MEDIUM: {
        maxRiskScore: number;
        minTVL: number;
        minProtocolAge: number;
        maxAllocationPerProtocol: number;
        allowedPoolTypes: string[];
        preferredProtocols: string[];
    };
    HIGH: {
        maxRiskScore: number;
        minTVL: number;
        minProtocolAge: number;
        maxAllocationPerProtocol: number;
        allowedPoolTypes: string[];
        preferredProtocols: string[];
    };
};
export declare const THRESHOLDS: {
    MIN_APR_LOW_RISK: number;
    MIN_APR_MEDIUM_RISK: number;
    MIN_APR_HIGH_RISK: number;
    BRIDGE_COST_PERCENTAGE: number;
    MAX_GAS_PRICE_GWEI: number;
    MIN_LIQUIDITY_USD: number;
};
export declare const TOKEN_ADDRESSES: {
    BASE: {
        USDC: string;
        USDT: string;
        DAI: string;
        ETH: string;
    };
    AVALANCHE: {
        USDC: string;
        USDT: string;
        DAI: string;
        AVAX: string;
    };
};
export declare const CHAIN_CONFIG: {
    base: {
        chainId: number;
        name: string;
        nativeCurrency: string;
        blockTime: number;
        bridgeCost: number;
    };
    avalanche: {
        chainId: number;
        name: string;
        nativeCurrency: string;
        blockTime: number;
        bridgeCost: number;
    };
};
export declare const CONTRACT_ABI: string[];
//# sourceMappingURL=constant.d.ts.map