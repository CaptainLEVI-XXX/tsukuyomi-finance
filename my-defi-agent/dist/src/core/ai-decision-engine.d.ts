import type { PoolData } from '../types/index.ts';
export declare class AIDecisionEngine {
    private anthropic;
    constructor();
    analyzeMarketConditions(rawData: any): Promise<{
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        confidence: number;
        reasoning: string[];
        riskAdjustment: number;
        recommendedAction: 'AGGRESSIVE' | 'CONSERVATIVE' | 'BALANCED';
        marketPhase: string;
    }>;
    evaluatePoolRisk(pool: PoolData, marketContext: any): Promise<{
        aiRiskScore: number;
        reasoning: string[];
        redFlags: string[];
        opportunities: string[];
        recommendation: 'AVOID' | 'CAUTION' | 'MODERATE' | 'RECOMMENDED';
        maxAllocation: number;
    }>;
    optimizePortfolio(pools: PoolData[], amount: number, riskTolerance: string, marketAnalysis: any): Promise<{
        allocations: Array<{
            pool: PoolData;
            percentage: number;
            reasoning: string;
        }>;
        strategy: string;
        expectedAPY: number;
        riskScore: number;
        aiRecommendations: string[];
    }>;
    shouldRebalance(currentPositions: any[], marketConditions: any): Promise<{
        shouldRebalance: boolean;
        urgency: 'LOW' | 'MEDIUM' | 'HIGH';
        recommendations: string[];
        suggestedActions: Array<{
            action: 'INCREASE' | 'DECREASE' | 'EXIT' | 'HARVEST';
            position: string;
            percentage: number;
            reasoning: string;
        }>;
    }>;
    evaluateExecutionTiming(strategy: any, marketConditions: any): Promise<{
        shouldExecuteNow: boolean;
        confidence: number;
        reasoning: string[];
        alternativeTiming: string;
        riskFactors: string[];
    }>;
    generateInvestmentReport(strategy: any, executionResults: any[], marketContext: any): Promise<{
        executiveSummary: string;
        performanceAnalysis: string;
        riskAssessment: string;
        nextSteps: string[];
        confidenceLevel: number;
    }>;
    private getFallbackMarketAnalysis;
    private getFallbackRiskAnalysis;
    private getFallbackPortfolioOptimization;
    testConnection(): Promise<boolean>;
}
