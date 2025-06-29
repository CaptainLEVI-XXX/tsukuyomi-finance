import { ethers } from 'ethers';
import type { PoolRecommendation, ExecutionResult } from '../types/index.ts';
import { CONTRACT_ABI, TOKEN_ADDRESSES } from '../utils/constant.ts';
import { logger } from '../utils/logger.ts';
import { Formatters } from '../utils/helper.ts';

export class ContractExecutor {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private chain: string;

  constructor(chain: string) {
    this.chain = chain;
    
    const rpcUrl = chain === 'base' ? 
      process.env.BASE_RPC_URL : 
      process.env.AVALANCHE_RPC_URL;
    
    const contractAddress = chain === 'base' ? 
      process.env.STRATEGY_MANAGER_BASE : 
      process.env.STRATEGY_MANAGER_AVALANCHE;

    if (!rpcUrl || !contractAddress) {
      throw new Error(`Missing configuration for chain: ${chain}`);
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);
    this.contract = new ethers.Contract(contractAddress, CONTRACT_ABI, this.wallet);
    
    logger.info(`🔗 Initialized contract executor for ${chain}`);
  }

  async validateConnection(): Promise<boolean> {
    try {
      const [blockNumber, balance, chainId] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getBalance(this.wallet.address),
        this.provider.getNetwork()
      ]);

      logger.info(`✅ ${this.chain} connection validated:`);
      logger.info(`   Block: ${blockNumber}`);
      logger.info(`   Balance: ${ethers.formatEther(balance)} ETH`);
      logger.info(`   Chain ID: ${chainId.chainId}`);

      // Check if wallet has sufficient balance for gas
      if (balance < ethers.parseEther('0.01')) {
        logger.warn(`⚠️ Low ETH balance for gas fees: ${ethers.formatEther(balance)}`);
      }

      return true;
    } catch (error) {
      logger.error(`❌ Failed to validate ${this.chain} connection:`, error);
      return false;
    }
  }

  async executeInvestment(
    poolId: number,
    recommendation: PoolRecommendation
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`🚀 Executing investment in ${recommendation.pool.project}`);
      logger.info(`💰 Amount: ${Formatters.formatUSD(recommendation.amountUSD)}`);
      logger.info(`📊 Strategy ID: ${recommendation.strategyId}`);

      // Prepare transaction parameters
      const tokenIds = recommendation.tokenAllocations.map(t => t.tokenId);
      const percentages = recommendation.tokenAllocations.map(t => t.percentage);
      const targetAsset = this.selectOptimalAsset(recommendation);

      // Pre-execution checks
      await this.performPreExecutionChecks(recommendation);

      // Estimate gas
      const gasEstimate = await this.contract.investCrossChain.estimateGas(
        poolId,
        recommendation.strategyId,
        tokenIds,
        percentages,
        targetAsset
      );

      // Add 25% buffer to gas estimate
      const gasLimit = gasEstimate * 125n / 100n;

      // Get current gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;

      logger.info(`⛽ Gas estimate: ${gasEstimate.toString()}`);
      logger.info(`💸 Gas price: ${ethers.formatUnits(gasPrice!, 'gwei')} gwei`);

      // Execute the transaction
      const tx = await this.contract.investCrossChain(
        poolId,
        recommendation.strategyId,
        tokenIds,
        percentages,
        targetAsset,
        { 
          gasLimit,
          gasPrice
        }
      );

      logger.info(`📝 Transaction submitted: ${tx.hash}`);
      logger.info(`⏳ Waiting for confirmation...`);

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed or reverted');
      }

      // Extract deposit ID from events
      const depositId = this.extractDepositId(receipt);
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const result: ExecutionResult = {
        success: true,
        transactionHash: tx.hash,
        depositId,
        gasUsed: receipt.gasUsed.toString(),
        totalCost: ethers.formatEther(gasCost),
        strategyId: recommendation.strategyId,
        poolId,
        timestamp: startTime,
        poolProject: recommendation.pool.project,
        allocation: recommendation.allocation,
        expectedAPY: recommendation.adjustedAPY
      };

      const executionTime = Date.now() - startTime;
      logger.info(`✅ Investment executed successfully in ${executionTime}ms`);
      logger.info(`🎯 Deposit ID: ${depositId}`);
      logger.info(`💸 Gas cost: ${result.totalCost} ETH`);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`❌ Investment execution failed after ${executionTime}ms:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
        timestamp: startTime,
        poolProject: recommendation.pool.project,
        allocation: recommendation.allocation,
        expectedAPY: recommendation.adjustedAPY
      };
    }
  }

  async harvestYield(strategyId: number, assets: string[]): Promise<ExecutionResult> {
    try {
      logger.info(`🌾 Harvesting yield for strategy ${strategyId}`);
      
      const tx = await this.contract.harvestYield(strategyId, assets);
      const receipt = await tx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Harvest transaction failed');
      }

      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        totalCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
        strategyId,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error(`❌ Harvest failed for strategy ${strategyId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Harvest failed',
        strategyId,
        timestamp: Date.now()
      };
    }
  }

  async withdrawFromStrategy(
    strategyId: number,
    asset: string,
    amount: string,
    poolId: number
  ): Promise<ExecutionResult> {
    try {
      logger.info(`💸 Withdrawing from strategy ${strategyId}: ${amount} ${asset}`);

      // Convert amount to proper decimals
      const amountWei = ethers.parseUnits(amount, 18);
      
      const tx = await this.contract.withdrawFromStrategy(
        strategyId,
        asset,
        amountWei,
        poolId
      );
      
      const receipt = await tx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Withdrawal transaction failed');
      }

      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        totalCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
        strategyId,
        poolId,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error(`❌ Withdrawal failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed',
        strategyId,
        poolId,
        timestamp: Date.now()
      };
    }
  }

  async getStrategyInfo(strategyId: number): Promise<any> {
    try {
      const strategy = await this.contract.getStrategy(strategyId);
      
      return {
        name: strategy[0],
        strategyAddress: strategy[1],
        chainSelector: strategy[2].toString(),
        isActive: strategy[7],
        totalAllocated: ethers.formatEther(strategy[8]),
        lastUpdateTime: new Date(Number(strategy[9]) * 1000)
      };
    } catch (error) {
      logger.error(`Error fetching strategy ${strategyId}:`, error);
      return null;
    }
  }

  async getAllocationInfo(strategyId: number, asset: string): Promise<any> {
    try {
      const allocation = await this.contract.getAllocation(strategyId, asset);
      
      return {
        strategyId: allocation[0].toString(),
        asset: allocation[1],
        principal: ethers.formatEther(allocation[2]),
        currentValue: ethers.formatEther(allocation[3]),
        lastHarvestTime: new Date(Number(allocation[4]) * 1000),
        isActive: allocation[5]
      };
    } catch (error) {
      logger.error(`Error fetching allocation:`, error);
      return null;
    }
  }

  private async performPreExecutionChecks(recommendation: PoolRecommendation): Promise<void> {
    // Check wallet balance
    const balance = await this.provider.getBalance(this.wallet.address);
    const minBalance = ethers.parseEther('0.01'); // Min 0.01 ETH for gas
    
    if (balance < minBalance) {
      throw new Error(`Insufficient ETH balance for gas: ${ethers.formatEther(balance)}`);
    }

    // Validate strategy ID
    if (recommendation.strategyId < 1 || recommendation.strategyId > 10) {
      throw new Error(`Invalid strategy ID: ${recommendation.strategyId}`);
    }

    // Check if strategy is active
    const strategyInfo = await this.getStrategyInfo(recommendation.strategyId);
    if (!strategyInfo?.isActive) {
      throw new Error(`Strategy ${recommendation.strategyId} is not active`);
    }

    logger.info('✅ Pre-execution checks passed');
  }

  private selectOptimalAsset(recommendation: PoolRecommendation): string {
    const chainTokens = TOKEN_ADDRESSES[this.chain.toUpperCase() as keyof typeof TOKEN_ADDRESSES];
    
    if (!chainTokens) {
      throw new Error(`No token addresses configured for chain: ${this.chain}`);
    }

    // Prefer USDC for most strategies
    const preferredTokens = ['USDC', 'USDT', 'DAI'];
    
    for (const token of preferredTokens) {
      if (recommendation.tokenAllocations.some(t => t.tokenSymbol.includes(token)) &&
          chainTokens[token as keyof typeof chainTokens]) {
        return chainTokens[token as keyof typeof chainTokens];
      }
    }

    // Fallback to USDC
    return chainTokens.USDC;
  }

  private extractDepositId(receipt: any): number {
    // Look for investment event in logs
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        
        if (parsed && (parsed.name === 'InvestmentExecuted' || parsed.name === 'DepositCreated')) {
          return parsed.args.depositId?.toNumber() || parsed.args[0]?.toNumber();
        }
      } catch {
        // Ignore parsing errors
      }
    }
    
    // Generate pseudo-random ID if event not found
    return Math.floor(Math.random() * 1000000) + Date.now() % 1000000;
  }
}