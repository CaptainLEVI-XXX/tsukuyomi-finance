import { ethers } from 'ethers';
import { STRATEGY_MAPPING } from '../utils/constants';
import strategyManagerABI from './abi/strategy-manager.json';

export class StrategyManagerContract {
    private contract: ethers.Contract;
    
    constructor(
        address: string,
        signer: ethers.Signer
    ) {
        this.contract = new ethers.Contract(
            address,
            strategyManagerABI,
            signer
        );
    }
    
    async executeInvestment(
        poolId: number,
        protocolName: string,
        tokenAllocations: any[],
        targetAsset: string
    ) {
        const strategyId = STRATEGY_MAPPING[protocolName];
        const tokenIds = tokenAllocations.map(t => t.tokenId);
        const percentages = tokenAllocations.map(t => t.percentage);
        
        const tx = await this.contract.investCrossChain(
            poolId,
            strategyId,
            tokenIds,
            percentages,
            targetAsset
        );
        
        return tx.wait();
    }
}