import type { PoolData, MarketConditions } from '../types/index.ts';
export declare class RiskAnalyzer {
    private riskFactors;
    analyzePoolRisk(pool: PoolData, marketConditions: MarketConditions): {
        overallScore: number;
        breakdown: Record<string, number>;
        recommendations: string[];
        warnings: string[];
    };
    analyzePortfolioRisk(pools: PoolData[], allocations: number[]): {
        portfolioScore: number;
        diversificationScore: number;
        concentrationRisk: number;
        recommendations: string[];
    };
    private calculateTVLRisk;
    private calculateProtocolRisk;
    private calculateAuditRisk;
    private calculateAgeRisk;
    private calculateMarketRisk;
    private calculateILRisk;
    private calculateDiversificationScore;
    private calculateConcentrationRisk;
    private calculateGini;
    private generateRecommendations;
    private generateWarnings;
    private generatePortfolioRecommendations;
}
