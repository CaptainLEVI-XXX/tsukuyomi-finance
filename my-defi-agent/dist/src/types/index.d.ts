export interface PoolData {
    id: string;
    symbol: string;
    project: string;
    chain: string;
    apy: number;
    apyBase?: number;
    apyReward?: number;
    tvlUsd: number;
    poolType: 'stable' | 'lendingVariable' | 'lendingFixed' | 'lpStable' | 'lpVolatile' | 'exotic';
    riskScore: number;
    underlyingTokens: string[];
    protocolAge: number;
    audits: 'audited' | 'unaudited' | 'unknown';
    ilRisk: boolean;
    exposure: 'single' | 'multi';
    url?: string;
    strategyId?: number;
}
export interface MarketConditions {
    volatilityIndex: number;
    trendDirection: 'bullish' | 'bearish' | 'neutral';
    gasPrice: number;
    bridgeCosts: number;
    topPerformingSectors: string[];
    marketFear: number;
    totalTVL: number;
}
export interface RouteNode {
    chain: string;
    protocol: string;
    pool: PoolData;
    cost: number;
    risk: number;
    apy: number;
}
export interface InvestmentRoute {
    path: RouteNode[];
    totalCost: number;
    totalRisk: number;
    expectedReturn: number;
    estimatedAPY: number;
    bridgeSteps: number;
    estimatedTime: number;
}
export interface TokenAllocation {
    tokenId: number;
    percentage: number;
    tokenSymbol: string;
}
export interface PoolRecommendation {
    pool: PoolData;
    strategyId: number;
    allocation: number;
    amountUSD: number;
    reasoning: string[];
    warnings: string[];
    expectedReturn: number;
    adjustedAPY: number;
    tokenAllocations: TokenAllocation[];
    aiInsights?: {
        recommendation: string;
        riskScore: number;
        maxAllocation: number;
    };
}
export interface InvestmentStrategy {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    pools: PoolRecommendation[];
    totalExpectedAPY: number;
    totalRiskScore: number;
    diversificationScore: number;
    estimatedAnnualReturn: number;
    gasAndBridgeCosts: number;
    aiStrategy?: string;
    aiRecommendations?: string[];
}
export interface ExecutionResult {
    success: boolean;
    transactionHash?: string;
    depositId?: number;
    gasUsed?: string;
    totalCost?: string;
    strategyId?: number;
    poolId?: number;
    error?: string;
    timestamp: number;
    poolProject?: string;
    allocation?: number;
    expectedAPY?: number;
}
export interface AnalysisResults {
    low: InvestmentStrategy;
    medium: InvestmentStrategy;
    high: InvestmentStrategy;
    marketConditions: MarketConditions;
    recommendations: string;
    summary: string;
}
export interface AutoExecutionConfig {
    minInvestmentAmount: number;
    maxRiskScore: number;
    executionDelay: number;
    maxSlippage: number;
    autoExecute: boolean;
}
