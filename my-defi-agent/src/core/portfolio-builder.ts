import type { PoolData, InvestmentStrategy, PoolRecommendation, TokenAllocation, MarketConditions } from '../types/index.ts';
import { RiskAnalyzer } from './risk-analyzer.ts';
import { AIDecisionEngine } from './ai-decision-engine.ts';
import { RISK_PROFILES, STRATEGY_MAPPING } from '../utils/constant.ts';
import { logger } from '../utils/logger.ts';
import { Formatters } from '../utils/helper.ts';

export class PortfolioBuilder {
  private riskAnalyzer: RiskAnalyzer;
  private aiEngine: AIDecisionEngine;

  constructor() {
    this.riskAnalyzer = new RiskAnalyzer();
    this.aiEngine = new AIDecisionEngine();
  }

  async buildStrategies(
    pools: PoolData[],
    amount: number,
    marketConditions: MarketConditions
  ): Promise<{
    low: InvestmentStrategy;
    medium: InvestmentStrategy;
    high: InvestmentStrategy;
  }> {
    logger.info(`🏗️ Building AI-powered strategies for ${Formatters.formatUSD(amount)}`);

    // Step 1: Get AI market analysis
    const aiMarketAnalysis = await this.aiEngine.analyzeMarketConditions(marketConditions);
    logger.info(`🧠 Claude recommends: ${aiMarketAnalysis.recommendedAction} approach`);

    // Step 2: AI-enhanced pool evaluation
    const aiEvaluatedPools = await this.evaluatePoolsWithAI(pools, aiMarketAnalysis);

    // Step 3: Build strategies with AI optimization
    const [lowStrategy, mediumStrategy, highStrategy] = await Promise.all([
      this.buildAIStrategy(aiEvaluatedPools, amount, 'LOW', aiMarketAnalysis),
      this.buildAIStrategy(aiEvaluatedPools, amount, 'MEDIUM', aiMarketAnalysis),
      this.buildAIStrategy(aiEvaluatedPools, amount, 'HIGH', aiMarketAnalysis)
    ]);

    return {
      low: lowStrategy,
      medium: mediumStrategy,
      high: highStrategy
    };
  }

  private async evaluatePoolsWithAI(pools: PoolData[], marketAnalysis: any): Promise<PoolData[]> {
    logger.info('🔍 Claude is evaluating pool risks...');

    const evaluatedPools = [];

    // Evaluate top pools with AI (limit to 20 for API efficiency)
    const topPools = pools.slice(0, 20);

    for (const pool of topPools) {
      try {
        const aiEvaluation = await this.aiEngine.evaluatePoolRisk(pool, marketAnalysis);

        // Merge AI insights with pool data
        const enhancedPool = {
          ...pool,
          aiRiskScore: aiEvaluation.aiRiskScore,
          aiRecommendation: aiEvaluation.recommendation,
          aiReasoning: aiEvaluation.reasoning,
          aiRedFlags: aiEvaluation.redFlags,
          aiOpportunities: aiEvaluation.opportunities,
          maxAIAllocation: aiEvaluation.maxAllocation
        };

        evaluatedPools.push(enhancedPool);
      } catch (error) {
        logger.warn(`⚠️ AI evaluation failed for ${pool.project}, using fallback`);
        evaluatedPools.push(pool);
      }
    }

    // Add remaining pools without AI evaluation
    evaluatedPools.push(...pools.slice(20));

    return evaluatedPools;
  }

  private async buildAIStrategy(
    pools: PoolData[],
    amount: number,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    aiMarketAnalysis: any
  ): Promise<InvestmentStrategy> {
    logger.info(`🤖 Claude is optimizing ${riskLevel} risk strategy...`);

    // Filter pools based on AI recommendations and risk profile
    const eligiblePools = this.filterPoolsWithAI(pools, riskLevel);

    // Get AI portfolio optimization
    const aiOptimization = await this.aiEngine.optimizePortfolio(
      eligiblePools,
      amount,
      riskLevel,
      aiMarketAnalysis
    );

    // Convert AI allocations to pool recommendations
    const poolRecommendations = aiOptimization.allocations.map((allocation, index) => {
      const amountUSD = (allocation.percentage / 100) * amount;

      return this.createAIPoolRecommendation(
        allocation.pool,
        allocation.percentage,
        amountUSD,
        index + 1,
        allocation.reasoning
      );
    });

    // Calculate strategy metrics with AI insights
    const strategy: InvestmentStrategy = {
      riskLevel,
      pools: poolRecommendations,
      totalExpectedAPY: aiOptimization.expectedAPY,
      totalRiskScore: aiOptimization.riskScore,
      diversificationScore: this.calculateStrategyMetrics(poolRecommendations, riskLevel).diversificationScore,
      estimatedAnnualReturn: Math.round(amount * (aiOptimization.expectedAPY / 100)),
      gasAndBridgeCosts: poolRecommendations.length * 15 + 50,
      aiStrategy: aiOptimization.strategy,
      aiRecommendations: aiOptimization.aiRecommendations
    };

    logger.info(`✅ Claude ${riskLevel} strategy: ${strategy.totalExpectedAPY.toFixed(2)}% APY, ${strategy.totalRiskScore} risk`);
    return strategy;
  }

  private filterPoolsWithAI(pools: PoolData[], riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'): PoolData[] {
    const profile = RISK_PROFILES[riskLevel];

    return pools.filter(pool => {
      // Standard filters
      if (pool.riskScore > profile.maxRiskScore) return false;
      if (pool.tvlUsd < profile.minTVL) return false;
      if (pool.protocolAge < profile.minProtocolAge) return false;

      // AI-based filters
      if ((pool as any).aiRecommendation === 'AVOID') return false;
      if (riskLevel === 'LOW' && (pool as any).aiRecommendation === 'CAUTION') return false;

      return true;
    });
  }

  private createAIPoolRecommendation(
    pool: PoolData,
    allocation: number,
    amountUSD: number,
    poolId: number,
    aiReasoning: string
  ): PoolRecommendation {
    // Combine traditional reasoning with AI insights
    const traditionalReasoning = this.generateReasoning(pool);
    const aiInsights = (pool as any).aiOpportunities || [];

    const reasoning = [
      `🧠 Claude: ${aiReasoning}`,
      ...aiInsights.slice(0, 2),
      ...traditionalReasoning.slice(0, 1)
    ];

    // Combine traditional warnings with AI red flags
    const traditionalWarnings = this.generateWarnings(pool);
    const aiRedFlags = (pool as any).aiRedFlags || [];

    const warnings = [
      ...aiRedFlags.slice(0, 2),
      ...traditionalWarnings.slice(0, 2)
    ];

    const tokenAllocations = this.determineTokenAllocations(pool);
    const adjustedAPY = pool.apy * 0.98; // Account for fees

    return {
      pool,
      strategyId: pool.strategyId || this.getStrategyId(pool.project),
      allocation,
      amountUSD,
      reasoning,
      warnings,
      expectedReturn: amountUSD * (adjustedAPY / 100),
      adjustedAPY,
      tokenAllocations,
      aiInsights: {
        recommendation: (pool as any).aiRecommendation,
        riskScore: (pool as any).aiRiskScore,
        maxAllocation: (pool as any).maxAIAllocation
      }
    };
  }

  private filterPoolsByRisk(pools: PoolData[], profile: any): PoolData[] {
    return pools.filter(pool => {
      // Risk score filter
      if (pool.riskScore > profile.maxRiskScore) return false;

      // TVL filter
      if (pool.tvlUsd < profile.minTVL) return false;

      // Protocol age filter
      if (pool.protocolAge < profile.minProtocolAge) return false;

      // Pool type filter
      if (profile.allowedPoolTypes[0] !== 'all' &&
          !profile.allowedPoolTypes.includes(pool.poolType)) return false;

      // APY sanity check
      if (pool.apy < 1 || pool.apy > 200) return false;

      return true;
    });
  }

  private scoreAndRankPools(
    pools: PoolData[],
    riskLevel: string,
    marketConditions: MarketConditions
  ): PoolData[] {
    return pools.map(pool => {
      // Risk-adjusted return calculation
      const riskFreeRate = 4.5;
      const excessReturn = pool.apy - riskFreeRate;
      const riskAdjustedScore = excessReturn / Math.max(pool.riskScore / 100, 0.1);

      // Market condition adjustments
      let marketMultiplier = 1;
      if (marketConditions.volatilityIndex > 70) {
        // High volatility - favor stable pools
        if (pool.poolType === 'stable') marketMultiplier = 1.3;
        else if (pool.poolType === 'lpVolatile') marketMultiplier = 0.6;
      } else if (marketConditions.volatilityIndex < 30) {
        // Low volatility - can take more risk
        if (pool.poolType === 'lpVolatile') marketMultiplier = 1.2;
      }

      // TVL bonus (logarithmic scale)
      const tvlBonus = Math.log10(pool.tvlUsd) / 12;

      // Protocol reputation bonus
      const reputationBonus = this.getProtocolReputation(pool.project);

      // Calculate final score
      const finalScore = riskAdjustedScore * marketMultiplier * tvlBonus * reputationBonus;

      return {
        ...pool,
        score: finalScore
      };
    }).sort((a, b) => (b as any).score - (a as any).score);
  }

  private optimizeAllocations(
    rankedPools: PoolData[],
    totalAmount: number,
    profile: any,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  ): PoolRecommendation[] {
    const recommendations: PoolRecommendation[] = [];
    let remainingAmount = totalAmount;

    // Diversification tracking
    const protocolExposure: Record<string, number> = {};
    const poolTypeExposure: Record<string, number> = {};

    // Target number of positions
    const targetPositions = riskLevel === 'LOW' ? 3 : riskLevel === 'MEDIUM' ? 5 : 7;

    for (const pool of rankedPools.slice(0, targetPositions * 2)) { // Consider 2x positions
      if (recommendations.length >= targetPositions) break;
      if (remainingAmount < totalAmount * 0.05) break; // Min 5% allocation

      // Check diversification constraints
      const currentProtocolExposure = protocolExposure[pool.project] || 0;
      const currentTypeExposure = poolTypeExposure[pool.poolType] || 0;

      if (currentProtocolExposure >= profile.maxAllocationPerProtocol) continue;
      if (currentTypeExposure >= 60) continue; // Max 60% in one type

      // Calculate optimal allocation
      const baseAllocation = 100 / targetPositions;
      const scoreMultiplier = ((pool as any).score || 1) / ((rankedPools[0] as any).score || 1);
      let allocation = baseAllocation * (0.8 + scoreMultiplier * 0.4);

      // Apply constraints
      allocation = Math.min(
        allocation,
        profile.maxAllocationPerProtocol - currentProtocolExposure,
        (remainingAmount / totalAmount) * 100
      );

      // Minimum allocation check
      if (allocation < 5) continue;

      allocation = Math.round(allocation);
      const amountUSD = (allocation / 100) * totalAmount;

      // Generate recommendation
      const recommendation = this.createPoolRecommendation(
        pool,
        allocation,
        amountUSD,
        recommendations.length + 1
      );

      recommendations.push(recommendation);

      // Update tracking
      protocolExposure[pool.project] = currentProtocolExposure + allocation;
      poolTypeExposure[pool.poolType] = currentTypeExposure + allocation;
      remainingAmount -= amountUSD;
    }

    // Normalize allocations to sum to 100%
    this.normalizeAllocations(recommendations, totalAmount);

    return recommendations;
  }

  private createPoolRecommendation(
    pool: PoolData,
    allocation: number,
    amountUSD: number,
    poolId: number
  ): PoolRecommendation {
    const reasoning = this.generateReasoning(pool);
    const warnings = this.generateWarnings(pool);
    const tokenAllocations = this.determineTokenAllocations(pool);
    const adjustedAPY = pool.apy * 0.98; // Account for fees

    return {
      pool,
      strategyId: pool.strategyId || this.getStrategyId(pool.project),
      allocation,
      amountUSD,
      reasoning,
      warnings,
      expectedReturn: amountUSD * (adjustedAPY / 100),
      adjustedAPY,
      tokenAllocations
    };
  }

  private generateReasoning(pool: PoolData): string[] {
    const reasons: string[] = [];

    // APY reasoning
    if (pool.apy > 20) {
      reasons.push(`Exceptional ${pool.apy.toFixed(1)}% APY with managed risk exposure`);
    } else if (pool.apy > 10) {
      reasons.push(`Strong ${pool.apy.toFixed(1)}% yield above market average`);
    } else {
      reasons.push(`Stable ${pool.apy.toFixed(1)}% returns with capital preservation focus`);
    }

    // TVL and safety
    if (pool.tvlUsd > 1e9) {
      reasons.push(`Massive ${Formatters.formatTVL(pool.tvlUsd)} TVL ensures deep liquidity`);
    } else if (pool.tvlUsd > 100e6) {
      reasons.push(`Healthy ${Formatters.formatTVL(pool.tvlUsd)} TVL provides stability`);
    }

    // Protocol maturity
    if (pool.protocolAge > 1095) {
      reasons.push(`Battle-tested protocol with ${Math.floor(pool.protocolAge / 365)} years of operation`);
    }

    // Risk profile
    if (pool.riskScore < 30) {
      reasons.push('Ultra-low risk suitable for conservative portfolios');
    } else if (pool.riskScore < 50) {
      reasons.push('Balanced risk-reward profile for steady growth');
    }

    // Pool type advantages
    const typeAdvantages: Record<string, string> = {
      'stable': 'Stablecoin pool eliminates volatility and impermanent loss',
      'lendingVariable': 'Variable lending rates capture market opportunities',
      'lendingFixed': 'Fixed rates provide predictable returns',
      'lpStable': 'Stable LP position with trading fee income'
    };

    if (typeAdvantages[pool.poolType]) {
      reasons.push(typeAdvantages[pool.poolType]);
    }

    return reasons;
  }

  private generateWarnings(pool: PoolData): string[] {
    const warnings: string[] = [];

    if (pool.ilRisk) {
      warnings.push('⚠️ Impermanent loss risk from price divergence between assets');
    }

    if (pool.riskScore > 70) {
      warnings.push('⚠️ High risk score - monitor position closely');
    }

    if (pool.apy > 50) {
      warnings.push('⚠️ Very high APY - verify sustainability and underlying mechanics');
    }

    if (pool.tvlUsd < 50e6) {
      warnings.push('⚠️ Lower TVL may result in higher slippage for large transactions');
    }

    if (pool.protocolAge < 180) {
      warnings.push('⚠️ Relatively new protocol - limited operational history');
    }

    if (pool.audits !== 'audited') {
      warnings.push('⚠️ No confirmed audit - higher smart contract risk');
    }

    return warnings;
  }

  private determineTokenAllocations(pool: PoolData): TokenAllocation[] {
    const tokens = pool.underlyingTokens;

    if (!tokens || tokens.length === 0) {
      // Default to USDC for unknown tokens
      return [{
        tokenId: 1,
        percentage: 100,
        tokenSymbol: 'USDC'
      }];
    }

    if (tokens.length === 1) {
      return [{
        tokenId: 1,
        percentage: 100,
        tokenSymbol: tokens[0]
      }];
    }

    // For stablecoin pools, prefer USDC
    const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX'];
    if (tokens.every(t => stablecoins.includes(t))) {
      const preferredToken = tokens.find(t => t === 'USDC') || tokens[0];
      return [{
        tokenId: 1,
        percentage: 100,
        tokenSymbol: preferredToken
      }];
    }

    // For multi-token pools, equal allocation
    const allocation = Math.floor(100 / tokens.length);
    return tokens.map((token, index) => ({
      tokenId: index + 1,
      percentage: index === tokens.length - 1 ?
        100 - (allocation * (tokens.length - 1)) : allocation,
      tokenSymbol: token
    }));
  }

  private calculateStrategyMetrics(
    allocations: PoolRecommendation[],
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  ): InvestmentStrategy {
    const totalExpectedAPY = allocations.reduce(
      (sum, alloc) => sum + (alloc.adjustedAPY * alloc.allocation / 100),
      0
    );

    const totalRiskScore = allocations.reduce(
      (sum, alloc) => sum + (alloc.pool.riskScore * alloc.allocation / 100),
      0
    );

    const estimatedAnnualReturn = allocations.reduce(
      (sum, alloc) => sum + alloc.expectedReturn,
      0
    );

    // Calculate diversification score
    const uniqueProtocols = new Set(allocations.map(a => a.pool.project)).size;
    const uniqueTypes = new Set(allocations.map(a => a.pool.poolType)).size;
    const diversificationScore = Math.min(uniqueProtocols * 20 + uniqueTypes * 15, 100);

    // Estimate costs
    const gasAndBridgeCosts = allocations.length * 15 + 50; // Rough estimate

    return {
      riskLevel,
      pools: allocations,
      totalExpectedAPY: Math.round(totalExpectedAPY * 100) / 100,
      totalRiskScore: Math.round(totalRiskScore),
      diversificationScore,
      estimatedAnnualReturn: Math.round(estimatedAnnualReturn),
      gasAndBridgeCosts
    };
  }

  private normalizeAllocations(recommendations: PoolRecommendation[], totalAmount: number): void {
    const totalAllocation = recommendations.reduce((sum, r) => sum + r.allocation, 0);

    if (Math.abs(totalAllocation - 100) > 0.1) {
      recommendations.forEach(r => {
        r.allocation = Math.round((r.allocation / totalAllocation) * 100);
        r.amountUSD = (r.allocation / 100) * totalAmount;
        r.expectedReturn = r.amountUSD * (r.adjustedAPY / 100);
      });
    }
  }

  private getProtocolReputation(project: string): number {
    const reputationMap: Record<string, number> = {
      'Aave': 1.3,
      'Compound': 1.25,
      'Curve': 1.2,
      'Uniswap': 1.15,
      'Balancer': 1.1,
      'Yearn': 1.05,
      'Convex': 1.05,
      'Lido': 1.1
    };

    for (const [protocol, multiplier] of Object.entries(reputationMap)) {
      if (project.toLowerCase().includes(protocol.toLowerCase())) {
        return multiplier;
      }
    }

    return 1.0; // Default multiplier
  }

  private getStrategyId(projectName: string): number {
    for (const [key, value] of Object.entries(STRATEGY_MAPPING)) {
      if (projectName.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    return 10; // Default fallback
  }
}
