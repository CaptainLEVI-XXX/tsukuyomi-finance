export class Formatters {
    static formatUSD(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    }
    
    static formatPercent(value: number): string {
        return `${value.toFixed(2)}%`;
    }
    
    static formatNumber(value: number): string {
        return new Intl.NumberFormat('en-US').format(value);
    }
    
    static formatTVL(tvl: number): string {
        if (tvl >= 1_000_000_000) {
            return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
        } else if (tvl >= 1_000_000) {
            return `$${(tvl / 1_000_000).toFixed(0)}M`;
        } else if (tvl >= 1_000) {
            return `$${(tvl / 1_000).toFixed(0)}K`;
        }
        return `$${tvl.toFixed(0)}`;
    }
    
    static formatRiskScore(score: number): string {
        if (score < 30) return `${score}/100 🟢`;
        if (score < 60) return `${score}/100 🟡`;
        return `${score}/100 🔴`;
    }
}