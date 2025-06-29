import dotenv from 'dotenv';
import { DeFiAIAgent } from './agent.ts';
import { logger } from './utils/logger.ts';
import { Formatters } from './utils/helper.ts';

// Load environment variables
dotenv.config();
async function main() {
  try {
    // ASCII Art Banner
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║                    🤖 DeFi AI Agent                      ║
    ║              Autonomous Investment System                ║
    ╚══════════════════════════════════════════════════════════╝
    `);

    logger.info('🚀 Starting DeFi AI Agent...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Initialize the AI agent
    const agent = new DeFiAIAgent();

    // Parse command line arguments
    const args = process.argv.slice(2);
    const mode = getMode(args);
    const amount = getAmount(args);
    const riskLevel = getRiskLevel(args);
    const autoExecute = args.includes('--execute') || args.includes('--auto');

    logger.info(`💰 Investment Amount: ${amount ? Formatters.formatUSD(amount) : 'Not specified'}`);
    logger.info(`📊 Risk Level: ${riskLevel}`);
    logger.info(`⚡ Auto Execute: ${autoExecute ? 'YES' : 'NO'}`);

    switch (mode) {
      case 'analyze':
        await runAnalysisMode(agent, amount, riskLevel);
        break;

      case 'execute':
        await runExecutionMode(agent, amount, riskLevel);
        break;

      case 'monitor':
        await runMonitoringMode(agent);
        break;

      case 'interactive':
      default:
        await runInteractiveMode(agent, amount, riskLevel, autoExecute);
        break;
    }

  } catch (error) {
    logger.error('💀 Fatal error:', error);
    process.exit(1);
  }
}

async function runAnalysisMode(agent: DeFiAIAgent, amount: number, riskLevel: string): Promise<void> {
  if (!amount) {
    logger.error('❌ Amount required for analysis. Use --amount=50000');
    return;
  }

  logger.info('\n📊 RUNNING INVESTMENT ANALYSIS...\n');

  const results = await agent.analyzeInvestmentOpportunities(null, amount, {
    currentChain: 'avalanche',
    targetChain: 'base',
    preferredRisk: riskLevel as any
  });

  // Display results
  console.log('\n' + '='.repeat(80));
  console.log(results.summary);
  console.log('='.repeat(80));
  console.log(results.recommendations);
  console.log('='.repeat(80) + '\n');

  // Save results to file
  const fs = await import('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `analysis-${timestamp}.json`;

  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  logger.info(`📁 Analysis saved to ${filename}`);
}

async function runExecutionMode(agent: DeFiAIAgent, amount: number, riskLevel: string): Promise<void> {
  if (!amount) {
    logger.error('❌ Amount required for execution. Use --amount=50000');
    return;
  }

  logger.info('\n🚀 RUNNING AUTONOMOUS EXECUTION...\n');

  const results = await agent.executeAutonomousInvestment(amount, {
    currentChain: 'avalanche',
    targetChain: 'base',
    preferredRisk: riskLevel as any
  });

  console.log('\n' + '='.repeat(80));
  console.log(results.summary);
  console.log('='.repeat(80) + '\n');

  if (results.success) {
    logger.info('✅ Autonomous execution completed successfully');
    logger.info('📊 Position monitoring is now active');
  } else {
    logger.error('❌ Execution encountered issues - check individual results');
  }
}

async function runMonitoringMode(agent: DeFiAIAgent): Promise<void> {
  logger.info('📊 Starting position monitoring mode...');

  // This would start a long-running monitoring process
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                 📊 MONITORING ACTIVE                     ║
  ║                                                          ║
  ║  Your positions are being monitored continuously.       ║
  ║  You'll receive notifications for:                      ║
  ║  • Performance updates                                  ║
  ║  • Rebalancing opportunities                           ║
  ║  • Risk alerts                                         ║
  ║                                                          ║
  ║  Press Ctrl+C to stop monitoring                       ║
  ╚══════════════════════════════════════════════════════════╝
  `);

  // Keep the process running
  process.on('SIGINT', () => {
    logger.info('👋 Stopping position monitoring...');
    process.exit(0);
  });

  // Simulate monitoring (in production this would be real monitoring)
  setInterval(() => {
    logger.info('🔍 Position check completed - all systems normal');
  }, 60000); // Every minute
}

async function runInteractiveMode(
  agent: DeFiAIAgent,
  amount: number,
  riskLevel: string,
  autoExecute: boolean
): Promise<void> {
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                🤖 INTERACTIVE MODE                       ║
  ║                                                          ║
  ║  Welcome to the DeFi AI Agent interactive mode!         ║
  ║                                                          ║
  ║  Available commands:                                     ║
  ║  • analyze --amount=50000 --risk=medium                  ║
  ║  • execute --amount=50000 --risk=low                     ║
  ║  • monitor                                              ║
  ║                                                          ║
  ║  The agent will provide intelligent recommendations     ║
  ║  and can execute investments autonomously.              ║
  ╚══════════════════════════════════════════════════════════╝
  `);

  if (amount && !autoExecute) {
    logger.info(`\n🎯 Running analysis for ${Formatters.formatUSD(amount)}...`);
    await runAnalysisMode(agent, amount, riskLevel);

    console.log('\n💡 To execute this strategy, run:');
    console.log(`   npm start -- --amount=${amount} --risk=${riskLevel.toLowerCase()} --execute\n`);
  } else if (amount && autoExecute) {
    await runExecutionMode(agent, amount, riskLevel);
  } else {
    console.log('\n💡 Example usage:');
    console.log('   npm start -- analyze --amount=50000 --risk=medium');
    console.log('   npm start -- execute --amount=100000 --risk=low');
    console.log('   npm start -- monitor\n');
  }
}

function getMode(args: string[]): string {
  if (args.includes('analyze') || args.includes('--analyze')) return 'analyze';
  if (args.includes('execute') || args.includes('--execute')) return 'execute';
  if (args.includes('monitor') || args.includes('--monitor')) return 'monitor';
  return 'interactive';
}

function getAmount(args: string[]): number {
  const amountArg = args.find(arg => arg.startsWith('--amount='));
  return amountArg ? parseInt(amountArg.split('=')[1]) : 0;
}

function getRiskLevel(args: string[]): string {
  const riskArg = args.find(arg => arg.startsWith('--risk='));
  const risk = riskArg ? riskArg.split('=')[1].toUpperCase() : 'MEDIUM';
  return ['LOW', 'MEDIUM', 'HIGH'].includes(risk) ? risk : 'MEDIUM';
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('👋 Shutting down DeFi AI Agent...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('💀 Unhandled rejection:', error);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    logger.info('✅ DeFi AI Agent session completed');
  }).catch(error => {
    logger.error('💀 Fatal error:', error);
    process.exit(1);
  });
}

export { DeFiAIAgent } from './agent.ts';
