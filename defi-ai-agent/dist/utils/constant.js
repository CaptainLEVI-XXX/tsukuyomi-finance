export const STRATEGY_MAPPING = {
    'Aave': 1,
    'Compound': 2,
    'Curve': 3,
    'Uniswap': 4,
    'Balancer': 5,
    'Yearn': 6,
    'Convex': 7,
    'Lido': 8,
    'Rocket Pool': 9,
    'Frax': 10
};
export const RISK_PROFILES = {
    LOW: {
        maxRiskScore: 40,
        minTVL: 100_000_000,
        minProtocolAge: 365,
        maxAllocationPerProtocol: 40,
        allowedPoolTypes: ['stable', 'lendingFixed', 'lendingVariable'],
        preferredProtocols: ['Aave', 'Compound', 'Curve']
    },
    MEDIUM: {
        maxRiskScore: 65,
        minTVL: 50_000_000,
        minProtocolAge: 180,
        maxAllocationPerProtocol: 50,
        allowedPoolTypes: ['stable', 'lendingVariable', 'lpStable', 'lendingFixed'],
        preferredProtocols: ['Aave', 'Compound', 'Curve', 'Uniswap', 'Balancer']
    },
    HIGH: {
        maxRiskScore: 85,
        minTVL: 10_000_000,
        minProtocolAge: 90,
        maxAllocationPerProtocol: 60,
        allowedPoolTypes: ['all'],
        preferredProtocols: ['all']
    }
};
export const THRESHOLDS = {
    MIN_APR_LOW_RISK: 5,
    MIN_APR_MEDIUM_RISK: 8,
    MIN_APR_HIGH_RISK: 12,
    BRIDGE_COST_PERCENTAGE: 0.3,
    MAX_GAS_PRICE_GWEI: 50,
    MIN_LIQUIDITY_USD: 1_000_000
};
export const TOKEN_ADDRESSES = {
    BASE: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        ETH: '0x4200000000000000000000000000000000000006'
    },
    AVALANCHE: {
        USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
        USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
        DAI: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
        AVAX: '0x0000000000000000000000000000000000000000'
    }
};
export const CHAIN_CONFIG = {
    base: {
        chainId: 8453,
        name: 'Base',
        nativeCurrency: 'ETH',
        blockTime: 2000,
        bridgeCost: 25
    },
    avalanche: {
        chainId: 43114,
        name: 'Avalanche',
        nativeCurrency: 'AVAX',
        blockTime: 2000,
        bridgeCost: 30
    }
};
export const CONTRACT_ABI = [
    "function investCrossChain(uint256 poolId, uint256 strategyId, uint256[] calldata tokenIds, uint256[] calldata percentages, address targetAsset) external returns (uint256 depositId)",
    "function harvestYield(uint256 strategyId, address[] calldata assets) external",
    "function withdrawFromStrategy(uint256 strategyId, address asset, uint256 amount, uint256 poolId) external",
    "function getStrategy(uint256 strategyId) external view returns (tuple(string name, address strategyAddress, uint64 chainSelector, bytes4 depositSelector, bytes4 withdrawSelector, bytes4 harvestSelector, bytes4 balanceSelector, bool isActive, uint256 totalAllocated, uint256 lastUpdateTime))",
    "function getAllocation(uint256 strategyId, address asset) external view returns (tuple(uint256 strategyId, address asset, uint256 principal, uint256 currentValue, uint256 lastHarvestTime, bool isActive))"
];
//# sourceMappingURL=constant.js.map