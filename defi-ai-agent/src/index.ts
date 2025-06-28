import dotenv from 'dotenv';
import { DeFiRiskManagerAgent } from './agent';
import { ContractService } from './services/contract-service';
import { logger } from './utils/logger';
import { Formatters } from './utils/formatters';

// Load environment variables
dotenv.config({ path: '.env.agent' });

async function main() {
    try {
        logger.info('🚀 Starting DeFi AI Agent...');
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        
        // Initialize the agent
        const agent = new DeFiRiskManagerAgent();
        
        // Parse command line arguments
        const args = process.argv.slice(2);
        const amountArg = args.find(arg => arg.startsWith('--amount='));
        const amount = amountArg ? parseInt(amountArg.split('=')[1]) : 100000;
        const execute = args.includes('--execute');
        const checkOnly = args.includes('--check');
        
        // Check connection if requested
        if (checkOnly) {
            logger.info('Checking contract connections...');
            const contractService = new ContractService('base');
            await contractService.checkConnection();
            return;
        }
        
        // Analyze opportunities
        logger.info(`Analyzing opportunities for ${Formatters.formatUSD(amount)}...`);
        
        const results = await agent.analyzeInvestmentOpportunities(
            null, // ElizaOS runtime (not needed for standalone)
            amount,
            {
                currentChain: 'Avalanche',
                targetChain: 'Base',
                preferredRisk: 'MEDIUM'
            }
        );
        
        // Display results
        console.log('\n' + '='.repeat(80));
        console.log(results.summary);
        console.log('='.repeat(80) + '\n');
        
        // Show detailed breakdown for recommended strategy
        const recommendedStrategy = results.marketConditions.volatilityIndex > 70 ? results.low :
                                   results.marketConditions.volatilityIndex < 30 ? results.high :
                                   results.medium;
        
        console.log(`\n📋 Detailed ${recommendedStrategy.riskLevel} Risk Portfolio:\n`);
        recommendedStrategy.pools.forEach((pool, i) => {
            console.log(`${i + 1}. ${pool.pool.project} - ${pool.pool.symbol}`);
            console.log(`   Allocation: ${pool.allocation}% (${Formatters.formatUSD(pool.amountUSD)})`);
            console.log(`   APY: ${Formatters.formatPercent(pool.adjustedAPY)}`);
            console.log(`   Risk: ${Formatters.formatRiskScore(pool.pool.riskScore || 50)}`);
            console.log(`   Strategy ID: ${pool.strategyId}`);
            console.log('');
        });
        
        // Save results to file
        const fs = require('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `analysis-${timestamp}.json`;
        
        fs.writeFileSync(
            filename,
            JSON.stringify(results, null, 2)
        );
        logger.info(`Results saved to ${filename}`);
        
        // Execute if requested
        if (execute && recommendedStrategy.pools.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('⚡ EXECUTING INVESTMENT STRATEGY');
            console.log('='.repeat(80) + '\n');
            
            const contractService = new ContractService('base');
            
            // Check connection first
            const connected = await contractService.checkConnection();
            if (!connected) {
                logger.error('Failed to connect to contract');
                return;
            }
            
            // Execute top recommendation
            const topPool = recommendedStrategy.pools[0];
            logger.info(`\nExecuting investment in ${topPool.pool.project}...`);
            
            try {
                const result = await contractService.executeInvestment(
                    1, // poolId - you may need to adjust this
                    topPool,
                    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC on Base
                );
                
                logger.info('✅ Investment executed successfully!');
                logger.info(`Transaction: ${result.transactionHash}`);
                logger.info(`Gas used: ${result.gasUsed}`);
                logger.info(`Total cost: ${result.totalCost} ETH`);
            } catch (error) {
                logger.error('❌ Investment execution failed:', error);
            }
        }
        
        // Display recommendations
        console.log('\n' + '='.repeat(80));
        console.log(results.recommendations);
        console.log('='.repeat(80) + '\n');
        
    } catch (error) {
        logger.error('Agent error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().then(() => {
        logger.info('✅ Analysis complete');
    }).catch(error => {
        logger.error('Fatal error:', error);
        process.exit(1);
    });
}

// Export for use as module
export { DeFiRiskManagerAgent } from './agent';