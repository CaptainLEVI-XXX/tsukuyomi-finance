import { PoolData, RiskMetrics } from '../types';
import { logger } from '../utils/logger';

export class RiskManagementEngine {
    // Risk thresholds (configurable)
    private readonly MAX_PROTOCOL_ALLOCATION = 30; // Max 30% in any single protocol
    private readonly MAX_RISK_SCORE = 65; // Don't invest if risk > 65
    private readonly MIN_TVL = 10_000_000; // $10M minimum TVL
    private readonly MIN_PROTOCOL_AGE = 90; // 90 days minimum
    
    calculateRiskMetrics(protocol: PoolData): RiskMetrics {
        // Use the risk breakdown from data aggregator if available
        if (protocol.riskBreakdown) {
            return {
                volatilityScore: protocol.riskBreakdown.volatilityRisk * 6.67, // Scale to 0-100
                protocolRiskScore: protocol.riskBreakdown.protocolRisk * 3.33,
                liquidityRiskScore: protocol.riskBreakdown.liquidityRisk * 4,
                smartContractRisk: protocol.riskBreakdown.smartContractRisk * 5,
                impermanentLossRisk: protocol.ilRisk ? 60 : 5,
                compositeRiskScore: protocol.riskBreakdown.total
            };
        }
        
        // Fallback calculation if no risk breakdown
        const volatilityScore = this.calculateVolatilityScore(protocol);
        const protocolRiskScore = this.calculateProtocolRisk(protocol);
        const liquidityRiskScore = this.calculateLiquidityRisk(protocol.tvlUsd, 0);
        const smartContractRisk = this.calculateSmartContractRisk(
            protocol.audits || 'unknown',
            protocol.protocolAge || 90
        );
        const impermanentLossRisk = this.calculateImpermanentLossRisk(protocol);
        
        const compositeRiskScore = (
            volatilityScore * 0.25 +
            protocolRiskScore * 0.25 +
            liquidityRiskScore * 0.20 +
            smartContractRisk * 0.20 +
            impermanentLossRisk * 0.10
        );
        
        return {
            volatilityScore,
            protocolRiskScore,
            liquidityRiskScore,
            smartContractRisk,
            impermanentLossRisk,
            compositeRiskScore
        };
    }
    
    private calculateVolatilityScore(protocol: PoolData): number {
        // Base volatility on pool type
        let score = 0;
        
        switch (protocol.poolType) {
            case 'stable':
                score = 10;
                break;
            case 'lendingFixed':
                score = 15;
                break;
            case 'lendingVariable':
                score = 30;
                break;
            case 'lpStable':
                score = 25;
                break;
            case 'lpVolatile':
                score = 60;
                break;
            case 'exotic':
                score = 80;
                break;
            default:
                score = 50;
        }
        
        // Adjust based on reward token exposure
        if (protocol.apyReward && protocol.apyBase) {
            const rewardRatio = protocol.apyReward / (protocol.apyBase + protocol.apyReward);
            score += rewardRatio * 20; // Add up to 20 points for high reward dependency
        }
        
        return Math.min(score, 100);
    }
    
    private calculateProtocolRisk(protocol: PoolData): number {
        let risk = 50; // Start at medium risk
        
        // Age factor
        const age = protocol.protocolAge || 90;
        if (age < 30) risk += 30;
        else if (age < 90) risk += 15;
        else if (age < 180) risk += 5;
        else if (age > 365) risk -= 10;
        else if (age > 730) risk -= 20;
        
        // Audit status
        if (protocol.audits === 'unaudited' || protocol.audits === 'unknown') risk += 20;
        else if (protocol.audits === 'partial') risk += 10;
        else if (protocol.audits === 'audited') risk -= 10;
        
        // TVL factor
        if (protocol.tvlUsd < 1_000_000) risk += 30;
        else if (protocol.tvlUsd < 10_000_000) risk += 15;
        else if (protocol.tvlUsd < 50_000_000) risk += 5;
        else if (protocol.tvlUsd > 100_000_000) risk -= 5;
        else if (protocol.tvlUsd > 1_000_000_000) risk -= 15;
        
        // Known protocol bonus
        const trustedProtocols = ['Aave', 'Compound', 'Curve', 'MakerDAO', 'Uniswap'];
        if (trustedProtocols.some(p => protocol.project.includes(p))) {
            risk -= 15;
        }
        
        return Math.max(0, Math.min(risk, 100));
    }
    
    private calculateLiquidityRisk(tvl: number, volume24h: number): number {
        // If no volume data, use TVL-based estimation
        if (!volume24h || volume24h === 0) {
            if (tvl > 1_000_000_000) return 5;
            if (tvl > 100_000_000) return 15;
            if (tvl > 10_000_000) return 30;
            if (tvl > 1_000_000) return 50;
            return 80;
        }
        
        const volumeToTvlRatio = volume24h / tvl;
        
        // Low volume relative to TVL = higher risk
        if (volumeToTvlRatio < 0.01) return 80;
        if (volumeToTvlRatio < 0.05) return 50;
        if (volumeToTvlRatio < 0.1) return 30;
        if (volumeToTvlRatio < 0.2) return 15;
        return 5;
    }
    
    private calculateSmartContractRisk(auditStatus: string, age: number): number {
        let baseRisk = 50;
        
        // Audit adjustments
        if (auditStatus === 'audited') baseRisk = 20;
        else if (auditStatus === 'partial') baseRisk = 40;
        else if (auditStatus === 'unaudited') baseRisk = 70;
        
        // Reduce risk for battle-tested contracts
        if (age > 730) baseRisk *= 0.5; // 2+ years
        else if (age > 365) baseRisk *= 0.7; // 1+ year
        else if (age > 180) baseRisk *= 0.85; // 6+ months
        
        return Math.min(baseRisk, 100);
    }
    
    private calculateImpermanentLossRisk(protocol: PoolData): number {
        if (!protocol.ilRisk) return 5;
        
        // Check if it's a correlated pair
        const tokens = protocol.underlyingTokens || [];
        const stables = ['USDC', 'USDT', 'DAI', 'FRAX', 'TUSD'];
        
        // All stables = minimal IL risk
        if (tokens.every(token => stables.some(stable => token.includes(stable)))) {
            return 5;
        }
        
        // Check for correlated assets
        const correlatedPairs = [
            ['WETH', 'stETH'],
            ['WBTC', 'renBTC'],
            ['USDC', 'USDT']
        ];
        
        for (const pair of correlatedPairs) {
            if (tokens.some(t => pair[0].includes(t)) && 
                tokens.some(t => pair[1].includes(t))) {
                return 20;
            }
        }
        
        // Default high IL risk for volatile pairs
        return 60;
    }
    
    validateAllocation(
        protocols: PoolData[],
        allocations: Map<string, number>
    ): { valid: boolean; warnings: string[] } {
        const warnings: string[] = [];
        let valid = true;
        
        // Check individual protocol allocation limits
        allocations.forEach((allocation, protocol) => {
            if (allocation > this.MAX_PROTOCOL_ALLOCATION) {
                warnings.push(`⚠️ ${protocol} allocation (${allocation}%) exceeds maximum (${this.MAX_PROTOCOL_ALLOCATION}%)`);
                valid = false;
            }
        });
        
        // Check total allocation
        const totalAllocation = Array.from(allocations.values()).reduce((sum, a) => sum + a, 0);
        if (Math.abs(totalAllocation - 100) > 0.1) {
            warnings.push(`⚠️ Total allocation (${totalAllocation}%) does not equal 100%`);
            valid = false;
        }
        
        // Check risk concentration
        const highRiskAllocation = protocols
            .filter(p => (p.riskScore || 0) > 70)
            .reduce((sum, p) => sum + (allocations.get(p.project) || 0), 0);
            
        if (highRiskAllocation > 30) {
            warnings.push(`⚠️ High risk allocation (${highRiskAllocation}%) exceeds recommended maximum (30%)`);
        }
        
        return { valid, warnings };
    }
}