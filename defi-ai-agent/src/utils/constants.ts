import dotenv from 'dotenv';
dotenv.config({ path: '.env.agent' });

export const CONFIG = {
    // API Endpoints
    APIS: {
        DEFI_LLAMA: process.env.DEFI_LLAMA_API || 'https://yields.llama.fi',
        DEXSCREENER: 'https://api.dexscreener.com/latest/dex',
        COINGECKO: 'https://api.coingecko.com/api/v3',
        GAS_TRACKER: 'https://api.owlracle.info/v4/base/gas',
    },
    
    // Chain Configuration
    CHAINS: {
        AVALANCHE: { 
            id: 43114, 
            selector: '0xa86a',
            rpc: process.env.RPC_URL_AVALANCHE 
        },
        BASE: { 
            id: 8453, 
            selector: '0x2105',
            rpc: process.env.RPC_URL_BASE 
        },
    },
    
    // Risk Parameters
    RISK_PROFILES: {
        LOW: {
            maxRiskScore: 35,
            minTVL: 50_000_000,
            minProtocolAge: 180,
            maxAllocationPerProtocol: 40,
            preferredProtocols: ['Aave', 'Compound', 'MakerDAO'],
            allowedPoolTypes: ['stable', 'lendingFixed'],
        },
        MEDIUM: {
            maxRiskScore: 65,
            minTVL: 10_000_000,
            minProtocolAge: 90,
            maxAllocationPerProtocol: 30,
            preferredProtocols: ['Aave', 'Compound', 'Curve', 'Balancer', 'Uniswap'],
            allowedPoolTypes: ['stable', 'lendingFixed', 'lendingVariable', 'lpStable'],
        },
        HIGH: {
            maxRiskScore: 85,
            minTVL: 1_000_000,
            minProtocolAge: 30,
            maxAllocationPerProtocol: 25,
            preferredProtocols: ['all'],
            allowedPoolTypes: ['all'],
        },
    },
    
    // Investment Thresholds
    THRESHOLDS: {
        MIN_APR_LOW_RISK: 5,
        MIN_APR_MEDIUM_RISK: 10,
        MIN_APR_HIGH_RISK: 20,
        BRIDGE_COST_PERCENTAGE: 0.15,
        GAS_BUFFER_USD: 50,
    },
    
    // Contract Addresses
    CONTRACTS: {
        STRATEGY_MANAGER: {
            BASE: process.env.STRATEGY_MANAGER_ADDRESS_BASE || '',
            AVALANCHE: process.env.STRATEGY_MANAGER_ADDRESS_AVALANCHE || '',
        }
    }
};

// Strategy ID mapping for protocols
export const STRATEGY_MAPPING: Record<string, number> = {
    'Aave': 1,
    'AAVE': 1,
    'Aave V3': 1,
    'Compound': 2,
    'Curve': 3,
    'Balancer': 4,
    'Uniswap': 5,
    'Aerodrome': 6,
    'BaseSwap': 7,
    'MakerDAO': 8,
    'Beefy': 9,
    'Yearn': 10,
};