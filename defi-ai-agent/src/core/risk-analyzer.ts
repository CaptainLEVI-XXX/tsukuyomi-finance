import { PoolData, MarketConditions } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class RiskAnalyzer {
  private riskFactors = {
    tvl: 0.25,      // 25% weight
    protocol: 0.20,  // 20% weight
    audit: 0.15,     // 15% weight
    age: 0.15,       // 15% weight
    market: 0.15,    // 15% weight
    il: 0.10         // 10% weight
  };

  analyzePoolRisk(pool: PoolData, marketConditions: MarketConditions): {
    overallScore: number;
    breakdown: Record<string, number>;
    recommendations: string[];
    warnings: string[];
  } {
    const breakdown = {
      tvlRisk: this.calculateTVLRisk(pool.tvlUsd),
      protocolRisk: this.calculateProtocolRisk(pool.project, pool.protocolAge),
      auditRisk: this.calculateAuditRisk(pool.audits),
      ageRisk: this.calculateAgeRisk(pool.protocolAge),
      marketRisk: this.calculateMarketRisk(pool, marketConditions),
      ilRisk: this.calculateILRisk(pool)
    };

    const overallScore = Object.entries(breakdown).reduce(
      (score, [key, value]) => {
        const factor = this.riskFactors[key.replace('Risk', '') as keyof typeof this.riskFactors] || 0;
        return score + (value * factor);
      },
      0
    );

    const recommendations = this.generateRecommendations(pool, breakdown);
    const warnings = this.generateWarnings(pool, breakdown, overallScore);

    return { overallScore, breakdown, recommendations, warnings };
  }

  analyzePortfolioRisk(pools: PoolData[], allocations: number[]): {
    portfolioScore: number;
    diversificationScore: number;
    concentrationRisk: number;
    recommendations: string[];
  } {
    const weightedRisk = pools.reduce((total, pool, index) => {
      return total + (pool.riskScore * allocations[index] / 100);
    }, 0);

    const diversificationScore = this.calculateDiversificationScore(pools, allocations);
    const concentrationRisk = this.calculateConcentrationRisk(allocations);

    const recommendations = this.generatePortfolioRecommendations(
      weightedRisk,
      diversificationScore,
      concentrationRisk
    );

    return {
      portfolioScore: weightedRisk,
      diversificationScore,
      concentrationRisk,
      recommendations
    };
  }

  private calculateTVLRisk(tvl: number): number {
    if (tvl > 1e9) return 10;  // >$1B = very low risk
    if (tvl > 500e6) return 20; // >$500M = low risk
    if (tvl > 100e6) return 35; // >$100M = medium risk
    if (tvl > 10e6) return 60;  // >$10M = high risk
    return 90; // <$10M = very high risk
  }

  private calculateProtocolRisk(project: string, age: number): number {
    const bluechipProtocols = ['aave', 'compound', 'curve', 'uniswap', 'makerdao'];
    const establishedProtocols = ['balancer', 'yearn', 'convex', 'lido'];
    
    let baseRisk = 50;
    
    if (bluechipProtocols.some(p => project.toLowerCase().includes(p))) {
      baseRisk = 15;
    } else if (establishedProtocols.some(p => project.toLowerCase().includes(p))) {
      baseRisk = 25;
    }

    // Age adjustment
    if (age > 1095) baseRisk -= 10; // >3 years
    else if (age > 365) baseRisk -= 5; // >1 year
    else if (age < 90) baseRisk += 20; // <3 months

    return Math.max(5, Math.min(95, baseRisk));
  }

  private calculateAuditRisk(auditStatus: string): number {
    switch (auditStatus) {
      case 'audited': return 15;
      case 'unaudited': return 80;
      default: return 50;
    }
  }

  private calculateAgeRisk(age: number): number {
    if (age > 1095) return 10;  // >3 years
    if (age > 730) return 20;   // >2 years
    if (age > 365) return 30;   // >1 year
    if (age > 180) return 50;   // >6 months
    if (age > 90) return 70;    // >3 months
    return 90; // <3 months
  }

  private calculateMarketRisk(pool: PoolData, market: MarketConditions): number {
    let risk = 30; // Base market risk

    // Volatility adjustment
    if (market.volatilityIndex > 70) risk += 20;
    else if (market.volatilityIndex < 30) risk -= 10;

    // Pool type adjustment
    if (pool.poolType === 'stable') risk -= 15;
    else if (pool.poolType === 'lpVolatile') risk += 15;
    else if (pool.poolType === 'exotic') risk += 25;

    // APY risk (unusually high APY = higher risk)
    if (pool.apy > 50) risk += 30;
    else if (pool.apy > 25) risk += 15;
    else if (pool.apy < 5) risk -= 5;

    return Math.max(5, Math.min(95, risk));
  }

  private calculateILRisk(pool: PoolData): number {
    if (!pool.ilRisk) return 5;
    
    if (pool.poolType === 'lpVolatile') return 70;
    if (pool.poolType === 'lpStable') return 25;
    return 40;
  }

  private calculateDiversificationScore(pools: PoolData[], allocations: number[]): number {
    const protocols = new Set(pools.map(p => p.project));
    const poolTypes = new Set(pools.map(p => p.poolType));
    const chains = new Set(pools.map(p => p.chain));

    const protocolDiversity = Math.min(protocols.size * 15, 60);
    const typeDiversity = Math.min(poolTypes.size * 20, 40);
    const chainDiversity = chains.size > 1 ? 20 : 0;

    return protocolDiversity + typeDiversity + chainDiversity;
  }

  private calculateConcentrationRisk(allocations: number[]): number {
    const maxAllocation = Math.max(...allocations);
    const giniCoefficient = this.calculateGini(allocations);
    
    return (maxAllocation * 0.7) + (giniCoefficient * 30);
  }

  private calculateGini(allocations: number[]): number {
    const sorted = [...allocations].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((sum, val) => sum + val, 0) / n;
    
    let numerator = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        numerator += Math.abs(sorted[i] - sorted[j]);
      }
    }
    
    return numerator / (2 * n * n * mean);
  }

  private generateRecommendations(pool: PoolData, breakdown: any): string[] {
    const recommendations: string[] = [];

    if (breakdown.tvlRisk < 30) {
      recommendations.push('✅ Excellent liquidity with deep TVL supporting large positions');
    }

    if (breakdown.protocolRisk < 25) {
      recommendations.push('✅ Battle-tested protocol with strong security track record');
    }

    if (breakdown.auditRisk < 30) {
      recommendations.push('✅ Comprehensive security audits reduce smart contract risks');
    }

    if (pool.apy > 15 && breakdown.overallScore < 40) {
      recommendations.push('🎯 High yield opportunity with controlled risk exposure');
    }

    if (pool.poolType === 'stable') {
      recommendations.push('💎 Stablecoin strategy eliminates price volatility risks');
    }

    return recommendations;
  }

  private generateWarnings(pool: PoolData, breakdown: any, overallScore: number): string[] {
    const warnings: string[] = [];

    if (overallScore > 70) {
      warnings.push('⚠️ High risk investment - suitable only for aggressive portfolios');
    }

    if (breakdown.tvlRisk > 60) {
      warnings.push('⚠️ Low TVL may result in high slippage and liquidity issues');
    }

    if (breakdown.auditRisk > 50) {
      warnings.push('⚠️ Unaudited protocol increases smart contract vulnerability');
    }

    if (breakdown.ageRisk > 60) {
      warnings.push('⚠️ Young protocol with limited operational history');
    }

    if (pool.apy > 50) {
      warnings.push('⚠️ Extremely high APY suggests elevated risk or unsustainable rewards');
    }

    if (pool.ilRisk && pool.poolType === 'lpVolatile') {
      warnings.push('⚠️ High impermanent loss risk due to volatile asset pairing');
    }

    return warnings;
  }

  private generatePortfolioRecommendations(
    portfolioScore: number,
    diversificationScore: number,
    concentrationRisk: number
  ): string[] {
    const recommendations: string[] = [];

    if (portfolioScore < 40) {
      recommendations.push('✅ Well-balanced portfolio with conservative risk profile');
    } else if (portfolioScore > 70) {
      recommendations.push('⚠️ Consider reducing exposure to high-risk positions');
    }

    if (diversificationScore < 60) {
      recommendations.push('📊 Increase diversification across protocols and pool types');
    }

    if (concentrationRisk > 70) {
      recommendations.push('⚖️ Reduce concentration risk by limiting single position sizes');
    }

    return recommendations;
  }
}