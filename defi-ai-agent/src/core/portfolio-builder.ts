import { PoolData, InvestmentStrategy, PoolRecommendation, TokenAllocation, MarketConditions } from '../types/index.js';
import { RiskAnalyzer } from './risk-analyzer.js';
import { RISK_PROFILES, STRATEGY_MAPPING } from '../utils/constant.js';
import { logger } from '../utils/logger.js';
import { Formatters } from '../utils/helper.js';

export class PortfolioBuilder {
  private riskAnalyzer: RiskAnalyzer;

  constructor() {
    this.riskAnalyzer = new RiskAnalyzer();
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
    logger.info(`🏗️ Building investment strategies for ${Formatters.formatUSD(amount)}`);

    const [lowStrategy, mediumStrategy, highStrategy] = await Promise.all([
      this.buildStrategy(pools, amount, 'LOW', marketConditions),
      this.buildStrategy(pools, amount, 'MEDIUM', marketConditions),
      this.buildStrategy(pools, amount, 'HIGH', marketConditions)
    ]);

    return {
      low: lowStrategy,
      medium: mediumStrategy,
      high: highStrategy
    };
  }

  private async buildStrategy(
    pools: PoolData[],
    amount: number,
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    marketConditions: MarketConditions
  ): Promise<InvestmentStrategy> {
    const profile = RISK_PROFILES[riskLevel];
    
    // Filter pools based on risk profile
    const eligiblePools = this.filterPoolsByRisk(pools, profile);
    logger.info(`${riskLevel}: ${eligiblePools.length} eligible pools`);

    // Score and rank pools
    const scoredPools = this.scoreAndRankPools(eligiblePools, riskLevel, marketConditions);

    // Allocate funds optimally
    const allocations = this.optimizeAllocations(scoredPools, amount, profile, riskLevel);

    // Calculate strategy metrics
    const strategy = this.calculateStrategyMetrics(allocations, riskLevel);

    return strategy;
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