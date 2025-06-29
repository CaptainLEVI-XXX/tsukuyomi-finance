import type { PoolData, InvestmentStrategy, MarketConditions } from '../types/index.ts';
export declare class PortfolioBuilder {
    private riskAnalyzer;
    private aiEngine;
    constructor();
    buildStrategies(pools: PoolData[], amount: number, marketConditions: MarketConditions): Promise<{
        low: InvestmentStrategy;
        medium: InvestmentStrategy;
        high: InvestmentStrategy;
    }>;
    private evaluatePoolsWithAI;
    private buildAIStrategy;
    private filterPoolsWithAI;
    private createAIPoolRecommendation;
    private filterPoolsByRisk;
    private scoreAndRankPools;
    private optimizeAllocations;
    private createPoolRecommendation;
    private generateReasoning;
    private generateWarnings;
    private determineTokenAllocations;
    private calculateStrategyMetrics;
    private normalizeAllocations;
    private getProtocolReputation;
    private getStrategyId;
}
