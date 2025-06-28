// Contract interfaces
export interface ICrossChainStrategyManager {
    investCrossChain(
        poolId: number,
        strategyId: number,
        tokenIds: number[],
        percentages: number[],
        targetAsset: string
    ): Promise<any>;
    
    harvestYield(strategyId: number, assets: string[]): Promise<any>;
    
    withdrawFromStrategy(
        strategyId: number,
        asset: string,
        amount: bigint,
        poolId: number
    ): Promise<any>;
    
    getStrategy(strategyId: number): Promise<StrategyInfo>;
    
    getAllocation(strategyId: number, asset: string): Promise<AllocationInfo>;
}

export interface StrategyInfo {
    name: string;
    strategyAddress: string;
    chainSelector: bigint;
    depositSelector: string;
    withdrawSelector: string;
    harvestSelector: string;
    balanceSelector: string;
    isActive: boolean;
    totalAllocated: bigint;
    lastUpdateTime: bigint;
}

export interface AllocationInfo {
    strategyId: bigint;
    asset: string;
    principal: bigint;
    currentValue: bigint;
    lastHarvestTime: bigint;
    isActive: boolean;
}