export class Formatters {
    static formatUSD(amount: number): string {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    }
  
    static formatPercent(percent: number): string {
      return `${percent.toFixed(2)}%`;
    }
  
    static formatTVL(tvl: number): string {
      if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
      if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
      if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(1)}K`;
      return `$${tvl.toFixed(0)}`;
    }
  
    static formatRiskScore(score: number): string {
      if (score < 30) return `${score} 🟢`;
      if (score < 60) return `${score} 🟡`;
      return `${score} 🔴`;
    }
  
    static formatTimeAgo(timestamp: number): string {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
  
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return 'Just now';
    }
  }
  
  export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  export function calculateAPY(principal: number, interest: number, periods: number = 1): number {
    return Math.pow(1 + interest / periods, periods) - 1;
  }
  
  export function calculateRiskAdjustedReturn(apy: number, riskScore: number): number {
    const riskFactor = (100 - riskScore) / 100;
    return apy * riskFactor;
  }
  
  export function validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  
  export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }