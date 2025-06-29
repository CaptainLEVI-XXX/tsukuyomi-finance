import { PoolRecommendation, ExecutionResult } from '../types/index.js';
export declare class ContractExecutor {
    private provider;
    private wallet;
    private contract;
    private chain;
    constructor(chain: string);
    validateConnection(): Promise<boolean>;
    executeInvestment(poolId: number, recommendation: PoolRecommendation): Promise<ExecutionResult>;
    harvestYield(strategyId: number, assets: string[]): Promise<ExecutionResult>;
    withdrawFromStrategy(strategyId: number, asset: string, amount: string, poolId: number): Promise<ExecutionResult>;
    getStrategyInfo(strategyId: number): Promise<any>;
    getAllocationInfo(strategyId: number, asset: string): Promise<any>;
    private performPreExecutionChecks;
    private selectOptimalAsset;
    private extractDepositId;
}
//# sourceMappingURL=contract-executor.d.ts.map