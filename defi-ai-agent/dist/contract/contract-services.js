import { ethers } from 'ethers';
import { logger } from '../utils/logger';
// Contract ABI for ICrossChainStrategyManager
const STRATEGY_MANAGER_ABI = [
    "function investCrossChain(uint256 poolId, uint256 strategyId, uint256[] calldata tokenIds, uint256[] calldata percentages, address targetAsset) external returns (uint256 depositId)",
    "function harvestYield(uint256 strategyId, address[] calldata assets) external",
    "function withdrawFromStrategy(uint256 strategyId, address asset, uint256 amount, uint256 poolId) external",
    "function getStrategy(uint256 strategyId) external view returns (tuple(string name, address strategyAddress, uint64 chainSelector, bytes4 depositSelector, bytes4 withdrawSelector, bytes4 harvestSelector, bytes4 balanceSelector, bool isActive, uint256 totalAllocated, uint256 lastUpdateTime))",
    "function getAllocation(uint256 strategyId, address asset) external view returns (tuple(uint256 strategyId, address asset, uint256 principal, uint256 currentValue, uint256 lastHarvestTime, bool isActive))"
];
// Strategy ID mapping
const STRATEGY_MAPPING = {
    'Aave': 1,
    'Compound': 2,
    'Curve': 3,
    'Uniswap': 4,
    'Balancer': 5,
    'Yearn': 6,
    'Convex': 7,
    'Lido': 8,
    'Rocket Pool': 9,
    'Frax': 10
};
export class ContractService {
    provider;
    wallet;
    contract;
    chain;
    constructor(chain) {
        this.chain = chain;
        const rpcUrl = chain === 'base' ? process.env.BASE_RPC_URL : process.env.AVALANCHE_RPC_URL;
        const contractAddress = chain === 'base' ?
            process.env.STRATEGY_MANAGER_BASE :
            process.env.STRATEGY_MANAGER_AVALANCHE;
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(contractAddress, STRATEGY_MANAGER_ABI, this.wallet);
    }
    async checkConnection() {
        try {
            await this.provider.getBlockNumber();
            const balance = await this.wallet.getBalance();
            logger.info(`✅ Connected to ${this.chain}. Wallet balance: ${ethers.formatEther(balance)} ETH`);
            return true;
        }
        catch (error) {
            logger.error(`❌ Failed to connect to ${this.chain}:`, error);
            return false;
        }
    }
    async executeInvestment(poolId, recommendation, targetAsset) {
        try {
            logger.info(`🚀 Executing investment: ${recommendation.pool.project} - ${recommendation.amountUSD} USD`);
            // Get strategy ID
            const strategyId = this.getStrategyId(recommendation.pool.project);
            if (!strategyId) {
                throw new Error(`Unknown strategy for project: ${recommendation.pool.project}`);
            }
            // Prepare token allocations
            const tokenIds = recommendation.tokenAllocations.map(t => t.tokenId);
            const percentages = recommendation.tokenAllocations.map(t => t.percentage);
            // Estimate gas
            const gasEstimate = await this.contract.investCrossChain.estimateGas(poolId, strategyId, tokenIds, percentages, targetAsset);
            // Add 20% buffer to gas estimate
            const gasLimit = gasEstimate * 120n / 100n;
            // Execute transaction
            const tx = await this.contract.investCrossChain(poolId, strategyId, tokenIds, percentages, targetAsset, { gasLimit });
            logger.info(`📝 Transaction submitted: ${tx.hash}`);
            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt.status === 0) {
                throw new Error('Transaction failed');
            }
            // Extract deposit ID from events
            const depositId = this.extractDepositId(receipt);
            const result = {
                success: true,
                transactionHash: tx.hash,
                depositId,
                gasUsed: receipt.gasUsed.toString(),
                totalCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
                strategyId,
                poolId,
                timestamp: Date.now()
            };
            logger.info(`✅ Investment executed successfully! Deposit ID: ${depositId}`);
            return result;
        }
        catch (error) {
            logger.error('❌ Investment execution failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };
        }
    }
    async harvestRewards(strategyId, assets) {
        try {
            logger.info(`🌾 Harvesting rewards for strategy ${strategyId}`);
            const tx = await this.contract.harvestYield(strategyId, assets);
            const receipt = await tx.wait();
            return {
                success: true,
                transactionHash: tx.hash,
                gasUsed: receipt.gasUsed.toString(),
                totalCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger.error('❌ Harvest failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };
        }
    }
    async withdrawFromStrategy(strategyId, asset, amount, poolId) {
        try {
            logger.info(`💸 Withdrawing from strategy ${strategyId}: ${amount} ${asset}`);
            const amountWei = ethers.parseUnits(amount, 18); // Adjust decimals as needed
            const tx = await this.contract.withdrawFromStrategy(strategyId, asset, amountWei, poolId);
            const receipt = await tx.wait();
            return {
                success: true,
                transactionHash: tx.hash,
                gasUsed: receipt.gasUsed.toString(),
                totalCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger.error('❌ Withdrawal failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };
        }
    }
    async getStrategyInfo(strategyId) {
        try {
            const strategy = await this.contract.getStrategy(strategyId);
            return {
                name: strategy.name,
                strategyAddress: strategy.strategyAddress,
                chainSelector: strategy.chainSelector.toString(),
                isActive: strategy.isActive,
                totalAllocated: ethers.formatEther(strategy.totalAllocated),
                lastUpdateTime: new Date(Number(strategy.lastUpdateTime) * 1000)
            };
        }
        catch (error) {
            logger.error(`Error getting strategy ${strategyId}:`, error);
            return null;
        }
    }
    async getAllocationInfo(strategyId, asset) {
        try {
            const allocation = await this.contract.getAllocation(strategyId, asset);
            return {
                strategyId: allocation.strategyId.toString(),
                asset: allocation.asset,
                principal: ethers.formatEther(allocation.principal),
                currentValue: ethers.formatEther(allocation.currentValue),
                lastHarvestTime: new Date(Number(allocation.lastHarvestTime) * 1000),
                isActive: allocation.isActive
            };
        }
        catch (error) {
            logger.error(`Error getting allocation for strategy ${strategyId}:`, error);
            return null;
        }
    }
    getStrategyId(projectName) {
        // Fuzzy matching for project names
        for (const [key, value] of Object.entries(STRATEGY_MAPPING)) {
            if (projectName.toLowerCase().includes(key.toLowerCase()) ||
                key.toLowerCase().includes(projectName.toLowerCase())) {
                return value;
            }
        }
        return null;
    }
    extractDepositId(receipt) {
        // Look for DepositCreated or similar event
        for (const log of receipt.logs) {
            try {
                const parsed = this.contract.interface.parseLog(log);
                if (parsed && parsed.name === 'InvestmentExecuted') {
                    return parsed.args.depositId.toNumber();
                }
            }
            catch {
                // Ignore parsing errors
            }
        }
        return Math.floor(Math.random() * 1000000); // Fallback random ID
    }
}
//# sourceMappingURL=contract-services.js.map