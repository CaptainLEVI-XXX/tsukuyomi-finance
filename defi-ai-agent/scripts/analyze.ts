#!/usr/bin/env ts-node
import { DeFiRiskManagerAgent } from '../src/agent';
import { Formatters } from '../src/utils/formatters';
import { logger } from '../src/utils/logger';
import fs from 'fs';

async function analyze() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const amount = parseInt(args[0]) || 100000;
    const risk = (args[1] || 'MEDIUM').toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
    const outputFile = args[2] || null;
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           DeFi AI Agent - Investment Analyzer             ║
╚═══════════════════════════════════════════════════════════╝

Analyzing opportunities for: ${Formatters.formatUSD(amount)}
Preferred risk level: ${risk}
Target chain: Base
`);
    
    try {
        const agent = new DeFiRiskManagerAgent();
        
        const startTime = Date.now();
        const results = await agent.analyzeInvestmentOpportunities(
            null,
            amount,
            {
                currentChain: 'Avalanche',
                targetChain: 'Base',
                preferredRisk: risk
            }
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Display summary
        console.log(results.summary);
        
        // Display strategy comparison
        console.log('\n📊 Strategy Comparison:\n');
        console.log('Strategy | Expected APY | Risk Score | Annual Return');
        console.log('---------|--------------|------------|---------------');
        console.log(`LOW      | ${results.low.totalExpectedAPY.toFixed(1)}%         | ${results.low.totalRiskScore}/100    | ${Formatters.formatUSD(results.low.estimatedAnnualReturn)}`);
        console.log(`MEDIUM   | ${results.medium.totalExpectedAPY.toFixed(1)}%      | ${results.medium.totalRiskScore}/100 | ${Formatters.formatUSD(results.medium.estimatedAnnualReturn)}`);
        console.log(`HIGH     | ${results.high.totalExpectedAPY.toFixed(1)}%        | ${results.high.totalRiskScore}/100    | ${Formatters.formatUSD(results.high.estimatedAnnualReturn)}`);
        
        // Save to file if requested
        if (outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
            console.log(`\n💾 Full results saved to: ${outputFile}`);
        }
        
        console.log(`\n⏱️  Analysis completed in ${duration} seconds`);
        console.log('\n✨ Run with --execute flag to execute the strategy on-chain');
        
    } catch (error) {
        logger.error('Analysis failed:', error);
        process.exit(1);
    }
}

// Show help if needed
if (process.argv.includes('--help')) {
    console.log(`
Usage: npm run analyze [amount] [risk] [output-file]

Arguments:
  amount      Investment amount in USD (default: 100000)
  risk        Risk level: LOW, MEDIUM, HIGH (default: MEDIUM)
  output-file Optional JSON file to save results

Examples:
  npm run analyze 50000
  npm run analyze 100000 LOW
  npm run analyze 250000 HIGH results.json
`);}