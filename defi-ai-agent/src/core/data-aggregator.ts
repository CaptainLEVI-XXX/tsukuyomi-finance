import axios from 'axios';
import { PoolData, MarketConditions } from '../types';
import { CONFIG } from '../utils/constants';
import { CacheManager } from '../utils/cache';
import { logger } from '../utils/logger';

export class DeFiDataAggregator {
    private cache: CacheManager;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    
    constructor() {
        this.cache = CacheManager.getInstance();
    }
    
    async fetchAllPools(chain: string = 'Base'): Promise<PoolData[]> {
        try {
            const cacheKey = `pools_${chain.toLowerCase()}`;
            const cached = this.cache.get<PoolData[]>(cacheKey);
            
            if (cached) {
                logger.info(`Returning cached data for ${chain} pools`);
                return cached;
            }
            
            logger.info(`Fetching pools data for ${chain}...`);
            
            // Fetch pools data from DeFi Llama
            const response = await axios.get(`${CONFIG.APIS.DEFI_LLAMA}/pools`, {
                headers: { 
                    'Accept': 'application/json',
                    'User-Agent': 'DeFi-AI-Agent/1.0'
                },
                timeout: 10000,
            });
            
            // Filter for specific chain
            const pools = response.data.data.filter((pool: any) => 
                pool.chain?.toLowerCase() === chain.toLowerCase() &&
                pool.tvlUsd > 100000 && // Min $100k TVL
                pool.apy !== null &&
                pool.apy > 0 &&
                pool.apy < 1000 // Filter out unrealistic APYs
            );
            
            logger.info(`Found ${pools.length} pools on ${chain}`);
            
            // Enrich with additional data
            const enrichedPools = await this.enrichPoolData(pools);
            
            this.cache.set(cacheKey, enrichedPools, 300); // 5 min cache
            return enrichedPools;
            
        } catch (error) {
            logger.error('Error fetching pools:', error);
            throw new Error('Failed to fetch DeFi pools data');
        }
    }
    
    private async enrichPoolData(pools: any[]): Promise<PoolData[]> {
        return Promise.all(pools.map(async (pool) => {
            const poolType = this.categorizePoolType(pool);
            const protocolAge = await this.getProtocolAge(pool.project);
            const riskBreakdown = this.calculateDetailedRisk(pool, poolType, protocolAge);
            
            return {
                ...pool,
                poolType,
                protocolAge,
                riskScore: riskBreakdown.total,
                riskBreakdown,
                underlyingTokens: pool.underlyingTokens || [],
                audits: pool.audits || 'unknown',
            };
        }));
    }
    
    private categorizePoolType(pool: any): PoolData['poolType'] {
        const symbol = pool.symbol?.toLowerCase() || '';
        const poolMeta = pool.poolMeta?.toLowerCase() || '';
        const project = pool.project?.toLowerCase() || '';
        
        // Stable pools
        if (pool.stablecoin || 
            ['usdc', 'usdt', 'dai', 'frax', 'tusd', 'busd'].some(stable => 
                symbol.includes(stable) && !symbol.includes('eth') && !symbol.includes('btc')
            ) ||
            poolMeta.includes('stable')) {
            return 'stable';
        }
        
        // Lending protocols
        if (['aave', 'compound', 'maker', 'radiant', 'benqi'].some(lender => 
            project.includes(lender)) ||
            poolMeta.includes('lending')) {
            return pool.apyBase && !pool.apyReward ? 'lendingFixed' : 'lendingVariable';
        }
        
        // LP tokens
        if (symbol.includes('-') || symbol.includes('lp') || poolMeta.includes('liquidity')) {
            return pool.ilRisk ? 'lpVolatile' : 'lpStable';
        }
        
        return 'exotic';
    }
    
    private calculateDetailedRisk(
        pool: any, 
        poolType: string, 
        protocolAge: number
    ): RiskBreakdown {
        // Protocol Risk (0-30)
        let protocolRisk = 30;
        if (pool.audits === 'audited') protocolRisk -= 10;
        if (protocolAge > 365) protocolRisk -= 10;
        else if (protocolAge > 180) protocolRisk -= 5;
        if (pool.tvlUsd > 100_000_000) protocolRisk -= 5;
        protocolRisk = Math.max(0, protocolRisk);
        
        // Liquidity Risk (0-25)
        let liquidityRisk = 25;
        if (pool.tvlUsd > 1_000_000_000) liquidityRisk = 5;
        else if (pool.tvlUsd > 100_000_000) liquidityRisk = 10;
        else if (pool.tvlUsd > 10_000_000) liquidityRisk = 15;
        else if (pool.tvlUsd > 1_000_000) liquidityRisk = 20;
        
        // Smart Contract Risk (0-20)
        let smartContractRisk = 20;
        if (pool.audits === 'audited') smartContractRisk = 10;
        if (protocolAge > 365) smartContractRisk -= 5;
        smartContractRisk = Math.max(5, smartContractRisk);
        
        // Volatility Risk (0-15)
        let volatilityRisk = 0;
        if (pool.ilRisk) volatilityRisk += 10;
        if (poolType === 'lpVolatile' || poolType === 'exotic') volatilityRisk += 5;
        
        // Complexity Risk (0-10)
        let complexityRisk = 0;
        if (poolType === 'exotic') complexityRisk = 10;
        else if (poolType === 'lendingVariable') complexityRisk = 5;
        else if (poolType === 'lpVolatile') complexityRisk = 7;
        
        const total = protocolRisk + liquidityRisk + smartContractRisk + 
                     volatilityRisk + complexityRisk;
        
        return {
            protocolRisk,
            liquidityRisk,
            smartContractRisk,
            volatilityRisk,
            complexityRisk,
            total: Math.min(total, 100),
        };
    }
    
    private async getProtocolAge(project: string): Promise<number> {
        const knownProtocols: Record<string, number> = {
            'Aave': 1460,
            'Aave V3': 730,
            'Compound': 1825,
            'Curve': 1095,
            'Uniswap': 1460,
            'Balancer': 1095,
            'MakerDAO': 2190,
            'Aerodrome': 365,
            'BaseSwap': 180,
            'Moonwell': 540,
            'Beefy': 1095,
            'Stargate': 730,
            'Velodrome': 730,
        };
        
        // Try exact match first
        if (knownProtocols[project]) {
            return knownProtocols[project];
        }
        
        // Try partial match
        for (const [protocol, age] of Object.entries(knownProtocols)) {
            if (project.toLowerCase().includes(protocol.toLowerCase()) ||
                protocol.toLowerCase().includes(project.toLowerCase())) {
                return age;
            }
        }
        
        return 90; // Default 90 days for unknown protocols
    }
    
    async getGasPrice(): Promise<number> {
        try {
            const cached = this.cache.get<number>('gasPrice');
            if (cached) return cached;
            
            const response = await axios.get(CONFIG.APIS.GAS_TRACKER, { timeout: 5000 });
            const gasPrice = response.data.avgGas || 30;
            
            this.cache.set('gasPrice', gasPrice, 60); // 1 min cache
            return gasPrice;
        } catch (error) {
            logger.warn('Failed to fetch gas price, using default');
            return 30; // Default fallback
        }
    }
    
    async getMarketConditions(): Promise<MarketConditions> {
        try {
            const gasPrice = await this.getGasPrice();
            
            // In production, you would integrate with real volatility indices
            // For now, we'll calculate based on recent pool APY variations
            const pools = await this.fetchAllPools('Base');
            const apyValues = pools.map(p => p.apy).filter(apy => apy < 100);
            const avgApy = apyValues.reduce((a, b) => a + b, 0) / apyValues.length;
            const apyStdDev = Math.sqrt(
                apyValues.reduce((sum, apy) => sum + Math.pow(apy - avgApy, 2), 0) / apyValues.length
            );
            
            // Simple volatility index based on APY standard deviation
            const volatilityIndex = Math.min(apyStdDev * 2, 100);
            
            // Determine trend based on high APY availability
            const highApyPools = pools.filter(p => p.apy > 20).length;
            const trendDirection = highApyPools > pools.length * 0.3 ? 'bullish' :
                                  highApyPools < pools.length * 0.1 ? 'bearish' : 'neutral';
            
            // Identify top sectors by average APY
            const sectorApys = new Map<string, { totalApy: number; count: number }>();
            pools.forEach(pool => {
                const sector = this.identifySector(pool);
                const current = sectorApys.get(sector) || { totalApy: 0, count: 0 };
                sectorApys.set(sector, {
                    totalApy: current.totalApy + pool.apy,
                    count: current.count + 1
                });
            });
            
            const topPerformingSectors = Array.from(sectorApys.entries())
                .map(([sector, data]) => ({
                    sector,
                    avgApy: data.totalApy / data.count
                }))
                .sort((a, b) => b.avgApy - a.avgApy)
                .slice(0, 3)
                .map(item => item.sector);
            
            return {
                volatilityIndex: Math.round(volatilityIndex),
                trendDirection,
                gasPrice,
                topPerformingSectors,
            };
        } catch (error) {
            logger.error('Failed to get market conditions:', error);
            return {
                volatilityIndex: 50,
                trendDirection: 'neutral',
                gasPrice: 30,
                topPerformingSectors: [],
            };
        }
    }
    
    private identifySector(pool: PoolData): string {
        const project = pool.project.toLowerCase();
        const symbol = pool.symbol.toLowerCase();
        
        if (['aave', 'compound', 'radiant', 'benqi'].some(p => project.includes(p))) {
            return 'Lending';
        }
        if (['curve', 'balancer', 'velodrome', 'aerodrome'].some(p => project.includes(p))) {
            return 'DEX';
        }
        if (pool.stablecoin || symbol.includes('usd')) {
            return 'Stablecoins';
        }
        if (symbol.includes('eth') || symbol.includes('steth')) {
            return 'LSDs';
        }
        if (['beefy', 'yearn', 'convex'].some(p => project.includes(p))) {
            return 'Yield Aggregators';
        }
        return 'Other';
    }
}

// Type guard for RiskBreakdown
interface RiskBreakdown {
    protocolRisk: number;
    liquidityRisk: number;
    smartContractRisk: number;
    volatilityRisk: number;
    complexityRisk: number;
    total: number;
}