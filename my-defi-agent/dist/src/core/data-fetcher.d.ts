import type { PoolData, MarketConditions } from '../types/index.ts';
export declare class DataFetcher {
    private cache;
    private cacheTimeout;
    fetchPoolsForChain(chain: string): Promise<PoolData[]>;
    fetchMarketConditions(): Promise<MarketConditions>;
    private fetchDefiLlamaData;
    private fetchDirectProtocolData;
    private transformDefiLlamaPool;
    private enrichPoolData;
    private categorizePoolType;
    private calculateRiskScore;
    private getStrategyId;
    private fetchVolatilityData;
    private fetchMarketTrends;
    private fetchGasData;
    private fetchBTCPrice;
    private getFromCache;
    private setCache;
    private getDefaultMarketConditions;
}
