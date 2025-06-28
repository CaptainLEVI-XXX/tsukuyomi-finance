import { 
    PoolData, 
    InvestmentStrategy, 
    RiskLevel, 
    PoolRecommendation,
    MarketConditions,
    TokenAllocation
} from '../types';
import { CONFIG, STRATEGY_MAPPING } from '../utils/constants';
import { DeFiDataAggregator } from './data-aggregator';
import { RiskManagementEngine } from './risk-engine';
import { logger } from '../utils/logger';
import { Formatters } from '../utils/formatters';

export class InvestmentOptimizer {
    private dataAggregator: DeFiDataAggregator;
    private riskEngine: RiskManagementEngine;
    
    constructor() {
        this.dataAggregator = new DeFiDataAggregator();
        this.riskEngine = new RiskManagementEngine();
    }
    
    async generateInvestmentStrategies(
        amount: number,
        currentChain: string = 'Avalanche',
        targetChain: string = 'Base'
    ): Promise<{
        low: InvestmentStrategy;
        medium: InvestmentStrategy;
        high: InvestmentStrategy;
        marketConditions: MarketConditions;
        recommendations: string;
    }> {
        logger.info(`Generating investment strategies for ${Formatters.formatUSD(amount)}`);
        
        // Fetch all available pools
        const allPools = await this.dataAggregator.fetchAllPools(targetChain);
        logger.info(`Analyzing ${allPools.length} pools on ${targetChain}`);
        
        // Get market conditions
        const marketConditions = await this.dataAggregator.getMarketConditions();
        
        // Generate strategies for each risk level
        const [lowRiskStrategy, mediumRiskStrategy, highRiskStrategy] = await Promise.all([
            this.optimizePortfolio(allPools, amount, 'LOW', marketConditions),
            this.optimizePortfolio(allPools, amount, 'MEDIUM', marketConditions),
            this.optimizePortfolio(allPools, amount, 'HIGH', marketConditions),
        ]);
        
        // Generate overall recommendations
        const recommendations = this.generateRecommendations(
            marketConditions,
            lowRiskStrategy,
            mediumRiskStrategy,
            highRiskStrategy,
            amount
        );
        
        return {
            low: lowRiskStrategy,
            medium: mediumRiskStrategy,
            high: highRiskStrategy,
            marketConditions,
            recommendations,
        };
    }
    
    private async optimizePortfolio(
        pools: PoolData[],
        amount: number,
        riskLevel: RiskLevel,
        marketConditions: MarketConditions
    ): Promise<InvestmentStrategy> {
        const profile = CONFIG.RISK_PROFILES[riskLevel];
        
        // 1. Filter pools based on risk profile
        const eligiblePools = pools.filter(pool => {
            // Risk score check
            if ((pool.riskScore || 100) > profile.maxRiskScore) return false;
            
            // TVL check
            if (pool.tvlUsd < profile.minTVL) return false;
            
            // Protocol age check
            if ((pool.protocolAge || 0) < profile.minProtocolAge) return false;
            
            // Pool type check
            if (profile.allowedPoolTypes[0] !== 'all' && 
                !profile.allowedPoolTypes.includes(pool.poolType)) return false;
            
            // APY threshold check
            const minAPY = riskLevel === 'LOW' ? CONFIG.THRESHOLDS.MIN_APR_LOW_RISK :
                          riskLevel === 'MEDIUM' ? CONFIG.THRESHOLDS.MIN_APR_MEDIUM_RISK :
                          CONFIG.THRESHOLDS.MIN_APR_HIGH_RISK;
            
            if (pool.apy < minAPY) return false;
            
            // Protocol preference - soft filter
            if (profile.preferredProtocols[0] !== 'all' &&
                !profile.preferredProtocols.some(p => pool.project.includes(p))) {
                // Apply penalty but don't exclude
                pool.riskScore = (pool.riskScore || 0) + 5;
            }
            
            return true;
        });
        
        logger.info(`${riskLevel} RISK: ${eligiblePools.length} eligible pools after filtering`);
        
        // 2. Score and rank pools
        const scoredPools = this.scoreAndRankPools(eligiblePools, riskLevel, marketConditions);
        
        // 3. Allocate funds using optimization algorithm
        const allocatedPools = this.allocateFunds(
            scoredPools,
            amount,
            profile.maxAllocationPerProtocol,
            riskLevel
        );
        
        // 4. Calculate strategy metrics
        const strategy = this.calculateStrategyMetrics(allocatedPools, riskLevel);
        
        return strategy;
    }
    
    private scoreAndRankPools(
        pools: PoolData[],
        riskLevel: string,
        marketConditions: MarketConditions
    ): PoolData[] {
        return pools.map(pool => {
            // Calculate risk-adjusted return (Sharpe-like ratio)
            const riskFreeRate = 4.5; // US Treasury rate
            const excessReturn = pool.apy - riskFreeRate;
            const riskAdjustedScore = excessReturn / Math.max((pool.riskScore || 50) / 100, 0.1);
            
            // Apply market condition adjustments
            let marketAdjustment = 1;
            if (marketConditions.volatilityIndex > 70) {
                // High volatility - prefer stable pools
                if (pool.poolType === 'stable' || pool.poolType === 'lendingFixed') {
                    marketAdjustment = 1.2;
                } else if (pool.poolType === 'lpVolatile' || pool.poolType === 'exotic') {
                    marketAdjustment = 0.7;
                }
            } else if (marketConditions.volatilityIndex < 30) {
                // Low volatility - can take more risk
                if (pool.poolType === 'lpVolatile') {
                    marketAdjustment = 1.1;
                }
            }
            
            // TVL bonus - prefer higher TVL for safety
            const tvlBonus = Math.log10(pool.tvlUsd) / 10; // 0.6 to 1.0 for $1M to $10B
            
            // Protocol age bonus
            const ageBonus = Math.min((pool.protocolAge || 90) / 365, 1.5); // Up to 1.5x for 1+ year
            
            // Calculate final score
            const finalScore = riskAdjustedScore * marketAdjustment * tvlBonus * ageBonus;
            
            return {
                ...pool,
                score: finalScore,
            };
        }).sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    
    private allocateFunds(
        rankedPools: PoolData[],
        totalAmount: number,
        maxAllocationPerPool: number,
        riskLevel: RiskLevel
    ): PoolRecommendation[] {
        const recommendations: PoolRecommendation[] = [];
        let remainingAmount = totalAmount;
        
        // Track protocol exposure to ensure diversification
        const protocolExposure: Record<string, number> = {};
        const poolTypeExposure: Record<string, number> = {};
        
        // Determine target number of pools based on risk level
        const targetPools = riskLevel === 'LOW' ? 3 : riskLevel === 'MEDIUM' ? 5 : 7;
        
        for (const pool of rankedPools) {
            if (recommendations.length >= targetPools) break;
            if (remainingAmount < totalAmount * 0.05) break; // Stop if less than 5% left
            
            // Check protocol exposure
            const currentProtocolExposure = protocolExposure[pool.project] || 0;
            if (currentProtocolExposure >= maxAllocationPerPool) continue;
            
            // Check pool type diversification
            const currentTypeExposure = poolTypeExposure[pool.poolType] || 0;
            if (currentTypeExposure >= 60 && recommendations.length > 2) continue; // Max 60% in one type
            
            // Calculate allocation based on score and remaining slots
            const remainingSlots = targetPools - recommendations.length;
            const baseAllocation = 100 / targetPools;
            
            // Adjust allocation based on score relative to top pool
            const scoreRatio = (pool.score || 0) / (rankedPools[0].score || 1);
            let allocation = baseAllocation * (0.7 + scoreRatio * 0.6); // 70% to 130% of base
            
            // Apply constraints
            allocation = Math.min(
                allocation,
                maxAllocationPerPool - currentProtocolExposure,
                (remainingAmount / totalAmount) * 100
            );
            
            // Minimum allocation threshold
            if (allocation < 5) continue;
            
            // Round to nearest percent
            allocation = Math.round(allocation);
            const amountUSD = (allocation / 100) * totalAmount;
            
            // Get strategy ID
            const strategyId = STRATEGY_MAPPING[pool.project] || 
                             Object.keys(STRATEGY_MAPPING).length + 1;
            
            // Generate reasoning and warnings
            const reasoning = this.generatePoolReasoning(pool, scoreRatio);
            const warnings = this.generateWarnings(pool);
            
            // Determine token allocations
            const tokenAllocations = this.determineTokenAllocation(pool);
            
            // Calculate adjusted APY (after fees)
            const bridgeFee = CONFIG.THRESHOLDS.BRIDGE_COST_PERCENTAGE;
            const adjustedAPY = pool.apy - bridgeFee;
            
            recommendations.push({
                pool,
                strategyId,
                allocation,
                amountUSD,
                reasoning,
                warnings,
                expectedReturn: amountUSD * (adjustedAPY / 100),
                adjustedAPY,
                tokenAllocations,
            });
            
            // Update tracking
            protocolExposure[pool.project] = currentProtocolExposure + allocation;
            poolTypeExposure[pool.poolType] = currentTypeExposure + allocation;
            remainingAmount -= amountUSD;
        }
        
        // Normalize allocations to sum to 100%
        const totalAllocation = recommendations.reduce((sum, r) => sum + r.allocation, 0);
        if (totalAllocation > 0 && Math.abs(totalAllocation - 100) > 0.1) {
            recommendations.forEach(r => {
                r.allocation = Math.round((r.allocation / totalAllocation) * 100);
                r.amountUSD = (r.allocation / 100) * totalAmount;
                r.expectedReturn = r.amountUSD * (r.adjustedAPY / 100);
            });
        }
        
        return recommendations;
    }
    
    private generatePoolReasoning(pool: PoolData, scoreRatio: number): string[] {
        const reasons: string[] = [];
        
        // APY reasoning
        if (pool.apy > 20) {
            reasons.push(`Exceptional APY of ${pool.apy.toFixed(2)}% with controlled risk (${pool.riskScore}/100)`);
        } else if (pool.apy > 10) {
            reasons.push(`Strong APY of ${pool.apy.toFixed(2)}% above market average`);
        } else {
            reasons.push(`Stable APY of ${pool.apy.toFixed(2)}% with minimal risk exposure`);
        }
        
        // TVL reasoning
        if (pool.tvlUsd > 1_000_000_000) {
            reasons.push(`Massive TVL of ${Formatters.formatTVL(pool.tvlUsd)} indicates deep liquidity and market confidence`);
        } else if (pool.tvlUsd > 100_000_000) {
            reasons.push(`Healthy TVL of ${Formatters.formatTVL(pool.tvlUsd)} ensures protocol stability`);
        } else if (pool.tvlUsd > 10_000_000) {
            reasons.push(`Solid TVL of ${Formatters.formatTVL(pool.tvlUsd)} with room for growth`);
        }
        
        // Risk reasoning
        if (pool.riskScore && pool.riskScore < 30) {
            reasons.push('Ultra-low risk profile ideal for capital preservation');
        } else if (pool.riskScore && pool.riskScore < 50) {
            reasons.push('Balanced risk-reward ratio suitable for steady growth');
        }
        
        // Pool type reasoning
        switch (pool.poolType) {
            case 'stable':
                reasons.push('Stablecoin pool eliminates impermanent loss and volatility risk');
                break;
            case 'lendingFixed':
                reasons.push('Fixed-rate lending provides predictable, sustainable returns');
                break;
            case 'lendingVariable':
                reasons.push('Variable lending rates capture market upside while maintaining liquidity');
                break;
            case 'lpStable':
                reasons.push('Stable LP position with trading fee income and minimal IL risk');
                break;
        }
        
        // Audit and age
        if (pool.audits === 'audited') {
            reasons.push('Fully audited smart contracts minimize security risks');
        }
        
        if (pool.protocolAge && pool.protocolAge > 365) {
            reasons.push(`Battle-tested protocol with ${Math.floor(pool.protocolAge / 365)} years of secure operation`);
        }
        
        // Score-based reasoning
        if (scoreRatio > 0.9) {
            reasons.push('Top-tier risk-adjusted returns in current market conditions');
        }
        
        return reasons;
    }
    
    private generateWarnings(pool: PoolData): string[] {
        const warnings: string[] = [];
        
        if (pool.ilRisk) {
            warnings.push('⚠️ Impermanent loss risk - price divergence between assets may impact returns');
        }
        
        if (pool.riskScore && pool.riskScore > 70) {
            warnings.push('⚠️ High risk score - only suitable for risk-tolerant investors');
        }
        
        if (pool.poolType === 'exotic') {
            warnings.push('⚠️ Complex strategy - ensure full understanding before investing');
        }
        
        if (pool.apyReward && pool.apyBase && pool.apyReward > pool.apyBase) {
            warnings.push('⚠️ Majority yield from reward tokens - monitor token price volatility');
        }
        
        if (pool.tvlUsd < 10_000_000) {
            warnings.push('⚠️ Lower TVL may result in higher slippage for large transactions');
        }
        
        if (pool.protocolAge && pool.protocolAge < 90) {
            warnings.push('⚠️ Relatively new protocol - limited track record');
        }
        
        if (pool.audits === 'unaudited' || pool.audits === 'unknown') {
            warnings.push('⚠️ No audit information available - higher smart contract risk');
        }
        
        return warnings;
    }
    
    private determineTokenAllocation(pool: PoolData): TokenAllocation[] {
        const tokens = pool.underlyingTokens || [];
        
        // For single asset pools
        if (tokens.length === 0 || tokens.length === 1) {
            const symbol = tokens[0] || pool.symbol.split('-')[0] || 'USDC';
            return [{
                tokenId: 1,
                percentage: 100,
                tokenSymbol: symbol
            }];
        }
        
        // For stablecoin pools
        const stables = ['USDC', 'USDT', 'DAI', 'FRAX'];
        if (tokens.every(t => stables.some(s => t.includes(s)))) {
            // Prefer USDC if available
            if (tokens.some(t => t.includes('USDC'))) {
                return [{
                    tokenId: 1,
                    percentage: 100,
                    tokenSymbol: 'USDC'
                }];
            }
            // Otherwise use first stable
            return [{
                tokenId: 1,
                percentage: 100,
                tokenSymbol: tokens[0]
            }];
        }
        
        // For two-token pools
        if (tokens.length === 2) {
            // Check for stable/volatile pair
            const hasStable = tokens.some(t => stables.some(s => t.includes(s)));
            const hasVolatile = tokens.some(t => ['ETH', 'BTC', 'AVAX'].some(v => t.includes(v)));
            
            if (hasStable && hasVolatile) {
                // 60/40 stable/volatile for safety
                return [
                    {
                        tokenId: 1,
                        percentage: 60,
                        tokenSymbol: tokens.find(t => stables.some(s => t.includes(s))) || tokens[0]
                    },
                    {
                        tokenId: 2,
                        percentage: 40,
                        tokenSymbol: tokens.find(t => !stables.some(s => t.includes(s))) || tokens[1]
                    }
                ];
            }
        }
        
        // Default: equal allocation
        const allocation = Math.floor(100 / tokens.length);
        const allocations = tokens.map((token, index) => ({
            tokenId: index + 1,
            percentage: index === tokens.length - 1 
                ? 100 - (allocation * (tokens.length - 1)) // Handle rounding
                : allocation,
            tokenSymbol: token
        }));
        
        return allocations;
    }
    
    private calculateStrategyMetrics(
        allocations: PoolRecommendation[],
        riskLevel: RiskLevel
    ): InvestmentStrategy {
        // Calculate weighted average APY
        const totalExpectedAPY = allocations.reduce(
            (sum, alloc) => sum + (alloc.adjustedAPY * alloc.allocation / 100),
            0
        );
        
        // Calculate weighted risk score
        const totalRiskScore = allocations.reduce(
            (sum, alloc) => sum + ((alloc.pool.riskScore || 50) * alloc.allocation / 100),
            0
        );
        
        // Calculate diversification score (0-100)
        const uniqueProtocols = new Set(allocations.map(a => a.pool.project)).size;
        const uniquePoolTypes = new Set(allocations.map(a => a.pool.poolType)).size;
        const protocolDiversity = Math.min(uniqueProtocols * 20, 60); // Up to 60 points
        const typeDiversity = Math.min(uniquePoolTypes * 20, 40); // Up to 40 points
        const diversificationScore = protocolDiversity + typeDiversity;
        
        // Calculate total expected return
        const estimatedAnnualReturn = allocations.reduce(
            (sum, alloc) => sum + alloc.expectedReturn,
            0
        );
        
        // Estimate gas and bridge costs
        const bridgeCost = allocations[0]?.amountUSD ? allocations[0].amountUSD * 0.0015 : 50;
        const gasCostPerTx = 5; // Estimated $5 per transaction on Base
        const gasAndBridgeCosts = bridgeCost + (allocations.length * gasCostPerTx);
        
        return {
            riskLevel,
            pools: allocations,
            totalExpectedAPY: Math.round(totalExpectedAPY * 100) / 100,
            totalRiskScore: Math.round(totalRiskScore),
            diversificationScore: Math.round(diversificationScore),
            estimatedAnnualReturn: Math.round(estimatedAnnualReturn),
            gasAndBridgeCosts: Math.round(gasAndBridgeCosts),
        };
    }
    
    private generateRecommendations(
        market: MarketConditions,
        low: InvestmentStrategy,
        medium: InvestmentStrategy,
        high: InvestmentStrategy,
        amount: number
    ): string {
        let recommendation = '## 🎯 AI Agent Recommendations\n\n';
        
        // Market condition analysis
        recommendation += `### 📊 Market Analysis\n`;
        recommendation += `- **Volatility**: ${market.volatilityIndex < 30 ? 'Low 🟢' : 
                            market.volatilityIndex < 60 ? 'Moderate 🟡' : 'High 🔴'} (${market.volatilityIndex}/100)\n`;
        recommendation += `- **Market Trend**: ${market.trendDirection.charAt(0).toUpperCase() + market.trendDirection.slice(1)}\n`;
        recommendation += `- **Gas Price**: ${market.gasPrice} Gwei\n`;
        recommendation += `- **Hot Sectors**: ${market.topPerformingSectors.join(', ') || 'Balanced across sectors'}\n\n`;
        
        // Risk level recommendation based on market conditions
        let recommendedStrategy: InvestmentStrategy;
        let reasoning: string;
        
        if (market.volatilityIndex > 70) {
            recommendedStrategy = low;
            recommendation += `### ⚡ High Market Volatility Detected\n`;
            reasoning = 'current high volatility favors capital preservation';
        } else if (market.volatilityIndex < 30 && market.trendDirection === 'bullish') {
            recommendedStrategy = high;
            recommendation += `### 🚀 Optimal Market Conditions\n`;
            reasoning = 'low volatility and bullish trend support higher risk tolerance';
        } else if (amount < 10000) {
            recommendedStrategy = medium;
            recommendation += `### 💰 Portfolio Size Consideration\n`;
            reasoning = 'moderate approach balances growth with gas efficiency';
        } else {
            recommendedStrategy = medium;
            recommendation += `### ⚖️ Balanced Market Environment\n`;
            reasoning = 'current conditions favor a balanced risk approach';
        }
        
        recommendation += `Given ${reasoning}, I recommend the **${recommendedStrategy.riskLevel} RISK** strategy.\n\n`;
        recommendation += `**Expected Annual Return**: ${Formatters.formatUSD(recommendedStrategy.estimatedAnnualReturn)} `;
        recommendation += `(${Formatters.formatPercent(recommendedStrategy.totalExpectedAPY)} APY)\n\n`;
        
        // Top performing sectors advice
        if (market.topPerformingSectors.length > 0) {
            recommendation += `### 📈 Sector Focus\n`;
            recommendation += `Current outperformers: **${market.topPerformingSectors.join(', ')}**\n`;
            recommendation += `The recommended strategy includes exposure to these sectors.\n\n`;
        }
        
        // Comparison table
        recommendation += `### 📊 Strategy Comparison\n\n`;
        recommendation += `| Strategy | Expected APY | Risk Score | Annual Return | Diversification |\n`;
        recommendation += `|----------|--------------|------------|---------------|----------------|\n`;
        recommendation += `| LOW      | ${low.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatRiskScore(low.totalRiskScore)} | ${Formatters.formatUSD(low.estimatedAnnualReturn)} | ${low.diversificationScore}/100 |\n`;
        recommendation += `| MEDIUM   | ${medium.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatRiskScore(medium.totalRiskScore)} | ${Formatters.formatUSD(medium.estimatedAnnualReturn)} | ${medium.diversificationScore}/100 |\n`;
        recommendation += `| HIGH     | ${high.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatRiskScore(high.totalRiskScore)} | ${Formatters.formatUSD(high.estimatedAnnualReturn)} | ${high.diversificationScore}/100 |\n\n`;
        
        // Specific actionable advice
        recommendation += `### 💡 Action Items\n`;
        recommendation += `1. **Bridge Funds**: Transfer from Avalanche to Base (est. cost: ${Formatters.formatUSD(recommendedStrategy.gasAndBridgeCosts)})\n`;
        recommendation += `2. **Timing**: Deploy within 24-48 hours to capture current APYs\n`;
        recommendation += `3. **Monitoring**: Set alerts for:\n`;
        recommendation += `   - APY changes > 20%\n`;
        recommendation += `   - TVL drops > 30%\n`;
        recommendation += `   - Risk score increases\n`;
        recommendation += `4. **Rebalancing**: Review positions weekly, rebalance if any pool deviates >10% from target\n\n`;
        
        // Risk warnings
        if (recommendedStrategy.riskLevel === 'HIGH') {
            recommendation += `### ⚠️ Risk Disclosure\n`;
            recommendation += `High-risk strategies can experience significant volatility. Only invest what you can afford to lose.\n`;
            recommendation += `Consider starting with a smaller position to test the waters.\n`;
        }
        
        return recommendation;
    }
}