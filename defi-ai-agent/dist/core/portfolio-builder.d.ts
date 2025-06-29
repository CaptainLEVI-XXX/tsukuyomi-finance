import { PoolData, InvestmentStrategy, MarketConditions } from '../types/index.js';
export declare class PortfolioBuilder {
    private riskAnalyzer;
    constructor();
    buildStrategies(pools: PoolData[], amount: number, marketConditions: MarketConditions): Promise<{
        low: InvestmentStrategy;
        medium: InvestmentStrategy;
        high: InvestmentStrategy;
    }>;
    private buildStrategy;
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
//# sourceMappingURL=portfolio-builder.d.ts.map