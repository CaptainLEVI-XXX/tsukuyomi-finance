import { PoolRecommendation, ExecutionResult } from '../types';
export declare class ContractService {
    private provider;
    private wallet;
    private contract;
    private chain;
    constructor(chain: string);
    checkConnection(): Promise<boolean>;
    executeInvestment(poolId: number, recommendation: PoolRecommendation, targetAsset: string): Promise<ExecutionResult>;
    harvestRewards(strategyId: number, assets: string[]): Promise<ExecutionResult>;
    withdrawFromStrategy(strategyId: number, asset: string, amount: string, poolId: number): Promise<ExecutionResult>;
    getStrategyInfo(strategyId: number): Promise<any>;
    getAllocationInfo(strategyId: number, asset: string): Promise<any>;
    private getStrategyId;
    private extractDepositId;
}
//# sourceMappingURL=contract-services.d.ts.map