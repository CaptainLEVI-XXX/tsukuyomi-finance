import type { PoolData, InvestmentRoute } from '../types/index.ts';
export declare class RouteOptimizer {
    private graph;
    private edges;
    findOptimalRoutes(sourceChain: string, targetChains: string[], amount: number, riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH', poolsByChain: Record<string, PoolData[]>): Promise<InvestmentRoute[]>;
    private buildInvestmentGraph;
    private bfsRouteSearch;
    private expandBFSPath;
    private scoreRoutes;
    private createCrossChainEdges;
    private estimateTransactionCost;
    private calculateBridgeCost;
    private estimateBridgeTime;
    private calculateRouteTime;
    private edgeMatches;
}
