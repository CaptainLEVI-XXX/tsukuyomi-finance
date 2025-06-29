export declare class Formatters {
    static formatUSD(amount: number): string;
    static formatPercent(percent: number): string;
    static formatTVL(tvl: number): string;
    static formatRiskScore(score: number): string;
    static formatTimeAgo(timestamp: number): string;
}
export declare function sleep(ms: number): Promise<void>;
export declare function calculateAPY(principal: number, interest: number, periods?: number): number;
export declare function calculateRiskAdjustedReturn(apy: number, riskScore: number): number;
export declare function validateAddress(address: string): boolean;
export declare function chunk<T>(array: T[], size: number): T[][];
//# sourceMappingURL=helper.d.ts.map