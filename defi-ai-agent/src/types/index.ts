// Core type definitions for the DeFi AI Agent

export interface PoolData {
    // Core identifiers
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    poolMeta?: string;
    underlyingTokens?: string[];
    
    // Financial metrics
    tvlUsd: number;
    apy: number;
    apyBase?: number;
    apyReward?: number;
    rewardTokens?: string[];
    
    // Risk metrics
    ilRisk: boolean;
    exposure: string;
    poolType: 'stable' | 'lendingFixed' | 'lendingVariable' | 'lpStable' | 'lpVolatile' | 'exotic';
    stablecoin: boolean;
    
    // Protocol info
    audits?: string;
    audit_links?: string[];
    protocolAge?: number;
    
    // Custom risk score
    riskScore?: number;
    riskBreakdown?: RiskBreakdown;
    score?: number; // For ranking
}

export interface RiskBreakdown {
    protocolRisk: number;
    liquidityRisk: number;
    smartContractRisk: number;
    volatilityRisk: number;
    complexityRisk: number;
    total: number;
}

export interface RiskMetrics {
    volatilityScore: number;
    protocolRiskScore: number;
    liquidityRiskScore: number;
    smartContractRisk: number;
    impermanentLossRisk: number;
    compositeRiskScore: number;
}

export interface InvestmentStrategy {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    pools: PoolRecommendation[];
    totalExpectedAPY: number;
    totalRiskScore: number;
    diversificationScore: number;
    estimatedAnnualReturn: number;
    gasAndBridgeCosts: number;
}

export interface PoolRecommendation {
    pool: PoolData;
    strategyId: number;
    allocation: number; // percentage
    amountUSD: number;
    reasoning: string[];
    warnings: string[];
    expectedReturn: number;
    adjustedAPY: number; // After fees
    tokenAllocations: TokenAllocation[];
}

export interface TokenAllocation {
    tokenId: number;
    percentage: number;
    tokenSymbol: string;
}

export interface MarketConditions {
    volatilityIndex: number;
    trendDirection: 'bullish' | 'bearish' | 'neutral';
    gasPrice: number;
    topPerformingSectors: string[];
}

export interface AnalysisResults {
    low: InvestmentStrategy;
    medium: InvestmentStrategy;
    high: InvestmentStrategy;
    marketConditions: MarketConditions;
    recommendations: string;
    summary: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskProfile {
    maxRiskScore: number;
    minTVL: number;
    minProtocolAge: number;
    maxAllocationPerProtocol: number;
    preferredProtocols: string[];
    allowedPoolTypes: string[];
}