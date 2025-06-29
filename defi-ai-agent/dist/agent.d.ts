import { Character, Plugin, IAgentRuntime, Memory, State } from '@elizaos/core';
import { AnalysisResults } from './types/index.js';
export declare class DeFiRiskManagerPlugin implements Plugin {
    name: string;
    description: string;
    private dataFetcher;
    private routeOptimizer;
    private portfolioBuilder;
    private contractExecutors;
    private positionMonitor;
    private notificationService;
    constructor();
    init(config: Record<string, string>, runtime: IAgentRuntime): Promise<void>;
    actions: {
        name: string;
        description: string;
        validate: () => Promise<boolean>;
        handler: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<{
            text: string;
            data: any;
        } | {
            text: string;
            data?: undefined;
        }>;
    }[];
    analyzeInvestmentOpportunities(runtime: IAgentRuntime | null, amount: number, options?: {
        currentChain?: string;
        targetChain?: string;
        preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }): Promise<AnalysisResults>;
    executeAutonomousInvestment(amount: number, options?: {
        currentChain?: string;
        targetChain?: string;
        preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
        forceExecution?: boolean;
    }): Promise<{
        success: boolean;
        summary: string;
        executedPositions: any[];
        totalInvested: number;
        failedPositions: any[];
    }>;
    private fetchPoolsForChains;
    private selectOptimalStrategy;
    private executeStrategy;
    private generateExecutiveSummary;
    private generateRecommendations;
    private generateExecutionSummary;
    private extractAmount;
    private extractOptions;
}
export declare const defiAICharacter: Character;
export declare class DeFiAIAgent {
    private plugin;
    constructor();
    analyzeInvestmentOpportunities(runtime: IAgentRuntime | null, amount: number, options?: {
        currentChain?: string;
        targetChain?: string;
        preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }): Promise<AnalysisResults>;
    executeAutonomousInvestment(amount: number, options?: {
        currentChain?: string;
        targetChain?: string;
        preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }): Promise<any>;
    getCharacter(): Character;
    getPlugin(): Plugin;
}
declare const _default: {
    character: Character;
    plugin: DeFiRiskManagerPlugin;
    agent: typeof DeFiAIAgent;
};
export default _default;
//# sourceMappingURL=agent.d.ts.map