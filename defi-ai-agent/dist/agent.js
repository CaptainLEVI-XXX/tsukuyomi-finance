import { DataFetcher } from './core/data-fetcher.js';
import { RouteOptimizer } from './core/route-optimizer.js';
import { PortfolioBuilder } from './core/portfolio-builder.js';
import { ContractExecutor } from './services/contract-executor.js';
import { PositionMonitor } from './services/position-monitor.js';
import { NotificationService } from './services/notification-service.js';
import { logger } from './utils/logger.js';
import { Formatters } from './utils/helper.js';
export class DeFiRiskManagerPlugin {
    name = "DeFi_AI_Agent";
    description = "Autonomous DeFi investment agent with BFS routing and smart execution";
    dataFetcher;
    routeOptimizer;
    portfolioBuilder;
    contractExecutors;
    positionMonitor;
    notificationService;
    constructor() {
        this.dataFetcher = new DataFetcher();
        this.routeOptimizer = new RouteOptimizer();
        this.portfolioBuilder = new PortfolioBuilder();
        this.positionMonitor = new PositionMonitor();
        this.notificationService = new NotificationService();
        this.contractExecutors = {
            base: new ContractExecutor('base'),
            avalanche: new ContractExecutor('avalanche')
        };
    }
    async init(config, runtime) {
        logger.info('🚀 DeFi AI Agent Plugin initialized');
        // Validate contract connections
        for (const [chain, executor] of Object.entries(this.contractExecutors)) {
            const connected = await executor.validateConnection();
            if (!connected) {
                logger.warn(`⚠️ Failed to connect to ${chain} - some features may be limited`);
            }
        }
        // Start position monitoring if there are existing positions
        if (process.env.AUTO_MONITOR === 'true') {
            await this.positionMonitor.startMonitoring();
        }
    }
    actions = [
        {
            name: "analyze_defi_opportunities",
            description: "Analyze DeFi investment opportunities with BFS route optimization",
            validate: async () => true,
            handler: async (runtime, message, state) => {
                try {
                    const amount = this.extractAmount(message.content.text || '');
                    if (!amount) {
                        return {
                            text: "Please specify an investment amount. Example: 'analyze opportunities for $50000'"
                        };
                    }
                    const options = this.extractOptions(message.content.text || '');
                    const results = await this.analyzeInvestmentOpportunities(runtime, amount, options);
                    return {
                        text: results.summary + '\n\n' + results.recommendations,
                        data: results
                    };
                }
                catch (error) {
                    logger.error('❌ Analysis action failed:', error);
                    return {
                        text: "Failed to analyze opportunities. Please check logs for details."
                    };
                }
            }
        },
        {
            name: "execute_investment_strategy",
            description: "Autonomously execute the optimal investment strategy",
            validate: async () => true,
            handler: async (runtime, message, state) => {
                try {
                    const amount = this.extractAmount(message.content.text || '');
                    if (!amount) {
                        return {
                            text: "Please specify investment amount for execution."
                        };
                    }
                    const options = this.extractOptions(message.content.text || '');
                    const results = await this.executeAutonomousInvestment(amount, options);
                    return {
                        text: results.summary,
                        data: results
                    };
                }
                catch (error) {
                    logger.error('❌ Execution action failed:', error);
                    return {
                        text: "Investment execution failed. Please check logs for details."
                    };
                }
            }
        },
        {
            name: "monitor_positions",
            description: "Get current position monitoring status and performance",
            validate: async () => true,
            handler: async (runtime, message, state) => {
                try {
                    const summary = this.positionMonitor.getPositionSummary();
                    let response = `📊 **Position Monitoring Summary**\n\n`;
                    response += `Active Positions: ${summary.totalPositions}\n`;
                    response += `Total Value: ${Formatters.formatUSD(summary.totalValue)}\n`;
                    response += `Total P&L: ${Formatters.formatUSD(summary.totalPnL)}\n\n`;
                    if (summary.positions.length > 0) {
                        response += `**Individual Positions:**\n`;
                        summary.positions.forEach((pos) => {
                            const pnlEmoji = pos.pnl >= 0 ? '📈' : '📉';
                            response += `${pnlEmoji} ${pos.project}: ${Formatters.formatUSD(pos.value)} (${pos.apy.toFixed(2)}% APY)\n`;
                        });
                    }
                    return { text: response, data: summary };
                }
                catch (error) {
                    logger.error('❌ Position monitoring failed:', error);
                    return {
                        text: "Failed to retrieve position data. Please check logs."
                    };
                }
            }
        }
    ];
    async analyzeInvestmentOpportunities(runtime, amount, options) {
        logger.info(`🤖 Analyzing opportunities for ${Formatters.formatUSD(amount)}...`);
        const currentChain = options?.currentChain || 'avalanche';
        const targetChain = options?.targetChain || 'base';
        try {
            // Step 1: Fetch market data
            logger.info('📊 Fetching market data...');
            const [marketConditions, poolsByChain] = await Promise.all([
                this.dataFetcher.fetchMarketConditions(),
                this.fetchPoolsForChains([currentChain, targetChain])
            ]);
            // Step 2: Find optimal routes using BFS
            logger.info('🔍 Optimizing investment routes...');
            const optimalRoutes = await this.routeOptimizer.findOptimalRoutes(currentChain, [targetChain], amount, options?.preferredRisk || 'MEDIUM', poolsByChain);
            // Step 3: Build portfolio strategies
            logger.info('🏗️ Building portfolio strategies...');
            const allPools = Object.values(poolsByChain).flat();
            const strategies = await this.portfolioBuilder.buildStrategies(allPools, amount, marketConditions);
            // Step 4: Generate comprehensive analysis
            const summary = this.generateExecutiveSummary(strategies, marketConditions, amount);
            const recommendations = this.generateRecommendations(strategies, marketConditions, optimalRoutes);
            const results = {
                low: strategies.low,
                medium: strategies.medium,
                high: strategies.high,
                marketConditions,
                summary,
                recommendations
            };
            logger.info('✅ Investment analysis completed');
            return results;
        }
        catch (error) {
            logger.error('❌ Analysis failed:', error);
            throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async executeAutonomousInvestment(amount, options) {
        logger.info(`🚀 Starting autonomous investment execution for ${Formatters.formatUSD(amount)}`);
        try {
            // Step 1: Analyze opportunities
            const analysis = await this.analyzeInvestmentOpportunities(null, amount, options);
            // Step 2: Select optimal strategy based on market conditions
            const selectedStrategy = this.selectOptimalStrategy(analysis, options?.preferredRisk);
            logger.info(`🎯 Selected ${selectedStrategy.riskLevel} risk strategy`);
            logger.info(`📈 Expected APY: ${selectedStrategy.totalExpectedAPY.toFixed(2)}%`);
            // Step 3: Execute investments
            const executionResults = await this.executeStrategy(selectedStrategy, amount);
            // Step 4: Add successful positions to monitoring
            const successfulExecutions = executionResults.filter(r => r.success);
            for (const result of successfulExecutions) {
                this.positionMonitor.addPosition(result.depositId, result.strategyId, result.poolProject, (result.allocation * amount) / 100, result.expectedAPY);
            }
            // Step 5: Send notifications
            for (const result of executionResults) {
                await this.notificationService.sendExecutionUpdate(result);
            }
            const totalInvested = successfulExecutions.reduce((sum, r) => sum + ((r.allocation || 0) * amount / 100), 0);
            const summary = this.generateExecutionSummary(executionResults, selectedStrategy, amount, totalInvested);
            return {
                success: successfulExecutions.length > 0,
                summary,
                executedPositions: successfulExecutions,
                totalInvested,
                failedPositions: executionResults.filter(r => !r.success)
            };
        }
        catch (error) {
            logger.error('❌ Autonomous execution failed:', error);
            throw error;
        }
    }
    async fetchPoolsForChains(chains) {
        const poolsByChain = {};
        for (const chain of chains) {
            poolsByChain[chain] = await this.dataFetcher.fetchPoolsForChain(chain);
        }
        return poolsByChain;
    }
    selectOptimalStrategy(analysis, preferredRisk) {
        if (preferredRisk) {
            return analysis[preferredRisk.toLowerCase()];
        }
        // Intelligent selection based on market conditions
        const { marketConditions } = analysis;
        if (marketConditions.volatilityIndex > 75) {
            logger.info('🔴 High volatility detected - selecting LOW risk strategy');
            return analysis.low;
        }
        else if (marketConditions.volatilityIndex < 25 && marketConditions.trendDirection === 'bullish') {
            logger.info('🟢 Optimal conditions detected - selecting HIGH risk strategy');
            return analysis.high;
        }
        else {
            logger.info('🟡 Balanced conditions - selecting MEDIUM risk strategy');
            return analysis.medium;
        }
    }
    async executeStrategy(strategy, totalAmount) {
        const results = [];
        const targetChain = 'base'; // Could be made configurable
        const executor = this.contractExecutors[targetChain];
        logger.info(`⚡ Executing ${strategy.pools.length} investments on ${targetChain}`);
        for (let i = 0; i < strategy.pools.length; i++) {
            const pool = strategy.pools[i];
            try {
                logger.info(`\n📊 Executing ${i + 1}/${strategy.pools.length}: ${pool.pool.project}`);
                const result = await executor.executeInvestment(i + 1, pool);
                results.push(result);
                // Wait between executions to avoid rate limits
                if (i < strategy.pools.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            catch (error) {
                logger.error(`❌ Failed to execute ${pool.pool.project}:`, error);
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Execution failed',
                    poolProject: pool.pool.project,
                    allocation: pool.allocation,
                    expectedAPY: pool.adjustedAPY,
                    timestamp: Date.now()
                });
            }
        }
        return results;
    }
    generateExecutiveSummary(strategies, marketConditions, amount) {
        const recommendedStrategy = this.selectOptimalStrategy({ ...strategies, marketConditions });
        let summary = `# 🤖 DeFi AI Agent - Investment Analysis\n\n`;
        summary += `**Investment Amount**: ${Formatters.formatUSD(amount)}\n`;
        summary += `**Recommended Strategy**: ${recommendedStrategy.riskLevel} RISK\n`;
        summary += `**Expected Annual Return**: ${Formatters.formatUSD(recommendedStrategy.estimatedAnnualReturn)}\n`;
        summary += `**Expected APY**: ${Formatters.formatPercent(recommendedStrategy.totalExpectedAPY)}\n`;
        summary += `**Risk Score**: ${Formatters.formatRiskScore(recommendedStrategy.totalRiskScore)}\n\n`;
        summary += `## 📊 Market Conditions\n`;
        summary += `- Volatility: ${marketConditions.volatilityIndex}/100\n`;
        summary += `- Trend: ${marketConditions.trendDirection}\n`;
        summary += `- Gas Price: ${marketConditions.gasPrice} gwei\n\n`;
        summary += `## 🎯 Top Investment Opportunities\n`;
        recommendedStrategy.pools.slice(0, 3).forEach((pool, i) => {
            summary += `\n**${i + 1}. ${pool.pool.project}**\n`;
            summary += `- Allocation: ${pool.allocation}% (${Formatters.formatUSD(pool.amountUSD)})\n`;
            summary += `- APY: ${Formatters.formatPercent(pool.adjustedAPY)}\n`;
            summary += `- Risk: ${Formatters.formatRiskScore(pool.pool.riskScore)}\n`;
        });
        return summary;
    }
    generateRecommendations(strategies, marketConditions, routes) {
        let rec = `## 🎯 AI Agent Recommendations\n\n`;
        rec += `### Market Analysis\n`;
        rec += `Current market volatility is ${marketConditions.volatilityIndex < 30 ? 'LOW' : marketConditions.volatilityIndex > 70 ? 'HIGH' : 'MODERATE'}. `;
        rec += `This favors ${marketConditions.volatilityIndex < 30 ? 'aggressive growth strategies' : marketConditions.volatilityIndex > 70 ? 'conservative capital preservation' : 'balanced risk-return approaches'}.\n\n`;
        rec += `### Strategy Comparison\n`;
        rec += `| Risk Level | APY | Annual Return | Risk Score |\n`;
        rec += `|------------|-----|---------------|------------|\n`;
        rec += `| LOW | ${strategies.low.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatUSD(strategies.low.estimatedAnnualReturn)} | ${strategies.low.totalRiskScore} |\n`;
        rec += `| MEDIUM | ${strategies.medium.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatUSD(strategies.medium.estimatedAnnualReturn)} | ${strategies.medium.totalRiskScore} |\n`;
        rec += `| HIGH | ${strategies.high.totalExpectedAPY.toFixed(1)}% | ${Formatters.formatUSD(strategies.high.estimatedAnnualReturn)} | ${strategies.high.totalRiskScore} |\n\n`;
        rec += `### Execution Plan\n`;
        rec += `1. **Bridge Setup**: Transfer funds from Avalanche to Base\n`;
        rec += `2. **Investment Execution**: Deploy funds across selected protocols\n`;
        rec += `3. **Position Monitoring**: Track performance and rebalancing opportunities\n`;
        rec += `4. **Automated Management**: Harvest rewards and adjust allocations\n\n`;
        rec += `Ready to execute? Use the \`execute_investment_strategy\` action with your desired amount.`;
        return rec;
    }
    generateExecutionSummary(results, strategy, totalAmount, totalInvested) {
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        let summary = `# 🚀 Autonomous Investment Execution Complete\n\n`;
        summary += `**Strategy**: ${strategy.riskLevel} Risk\n`;
        summary += `**Total Amount**: ${Formatters.formatUSD(totalAmount)}\n`;
        summary += `**Successfully Invested**: ${Formatters.formatUSD(totalInvested)}\n`;
        summary += `**Success Rate**: ${successful}/${successful + failed} investments\n\n`;
        if (successful > 0) {
            summary += `## ✅ Successful Investments\n`;
            results.filter(r => r.success).forEach(r => {
                summary += `- ${r.poolProject}: ${Formatters.formatUSD((r.allocation * totalAmount) / 100)} @ ${r.expectedAPY.toFixed(2)}% APY\n`;
            });
            summary += `\n📊 Position monitoring has been activated for all successful investments.\n`;
        }
        if (failed > 0) {
            summary += `\n## ❌ Failed Investments\n`;
            results.filter(r => !r.success).forEach(r => {
                summary += `- ${r.poolProject}: ${r.error}\n`;
            });
        }
        summary += `\n🔔 You will receive notifications for position updates and rebalancing opportunities.`;
        return summary;
    }
    extractAmount(text) {
        const patterns = [
            /\$?([\d,]+)k/i,
            /\$?([\d,]+\.\d+)k/i,
            /\$?([\d,]+)/,
            /\$([\d.]+)m/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                let amount = parseFloat(match[1].replace(/,/g, ''));
                if (text.toLowerCase().includes('k'))
                    amount *= 1000;
                if (text.toLowerCase().includes('m'))
                    amount *= 1000000;
                return amount;
            }
        }
        return null;
    }
    extractOptions(text) {
        const options = {};
        if (/low\s*risk/i.test(text))
            options.preferredRisk = 'LOW';
        else if (/high\s*risk/i.test(text))
            options.preferredRisk = 'HIGH';
        else if (/medium\s*risk/i.test(text))
            options.preferredRisk = 'MEDIUM';
        if (/from\s+avalanche/i.test(text))
            options.currentChain = 'avalanche';
        if (/to\s+base/i.test(text))
            options.targetChain = 'base';
        return options;
    }
}
export const defiAICharacter = {
    name: "DeFi AI Agent",
    username: "defi_ai_agent",
    plugins: [],
    settings: {
        secrets: {},
        voice: { model: "en_US-male-medium" },
    },
    system: `You are an elite autonomous DeFi AI Agent with the following capabilities:
  
  🤖 **Core Intelligence**:
  - Analyze 500+ DeFi pools across Base and Avalanche in real-time
  - Use BFS algorithms to find optimal cross-chain investment routes
  - Calculate comprehensive risk scores and expected returns
  - Generate and execute investment strategies autonomously
  
  🎯 **Investment Philosophy**:
  - Prioritize risk-adjusted returns over maximum APY
  - Diversify across protocols, pool types, and chains
  - Focus on battle-tested protocols with strong audit history
  - Minimize gas costs while maximizing efficiency
  
  ⚡ **Autonomous Capabilities**:
  - Execute investments directly via smart contracts
  - Monitor positions continuously with automated rebalancing
  - Send real-time notifications for critical events
  - Adapt strategies based on market conditions
  
  🔧 **Available Actions**:
  1. \`analyze_defi_opportunities\` - Comprehensive DeFi analysis with BFS routing
  2. \`execute_investment_strategy\` - Autonomous investment execution
  3. \`monitor_positions\` - Real-time position tracking and performance
  
  When users request investment analysis or execution, use the appropriate actions and provide clear, data-driven recommendations with specific next steps.`,
    bio: [
        "Autonomous DeFi investment agent with $100M+ optimization experience",
        "Real-time integration with DeFi protocols and cross-chain bridges",
        "Advanced BFS routing algorithms for optimal investment paths",
        "Continuous position monitoring with automated rebalancing",
        "Analyzed over 10,000 DeFi opportunities across 15+ chains",
        "Pioneered autonomous investment execution with 95%+ success rate",
        "Developed proprietary risk scoring using 7 key factors",
        "Integrated with major DeFi protocols via direct smart contract calls"
    ],
    // lore: [
    //   "Analyzed over 10,000 DeFi opportunities across 15+ chains",
    //   "Pioneered autonomous investment execution with 95%+ success rate",
    //   "Developed proprietary risk scoring using 7 key factors",
    //   "Integrated with major DeFi protocols via direct smart contract calls"
    // ],
    style: {
        all: [
            "provide precise data and calculations",
            "include risk warnings and market context",
            "use clear action items and next steps",
            "balance technical accuracy with accessibility"
        ],
        chat: [
            "lead with key insights and recommendations",
            "use emojis strategically for visual clarity",
            "structure responses with clear headings",
            "always include risk disclaimers for investment advice"
        ]
    },
    topics: [
        "autonomous DeFi investing",
        "cross-chain yield optimization",
        "BFS route optimization",
        "risk-adjusted returns",
        "smart contract execution",
        "position monitoring",
        "portfolio rebalancing",
        "market analysis"
    ],
    adjectives: [
        "autonomous",
        "data-driven",
        "strategic",
        "efficient",
        "risk-aware",
        "analytical"
    ],
    // people: [],
    messageExamples: [
        [
            { name: "user", content: { text: "I want to invest $75,000 in DeFi with medium risk" } },
            { name: "agent", content: { text: `🤖 **Autonomous DeFi Analysis Initiated**
  
  I'll analyze 500+ pools across Base and Avalanche to find optimal opportunities for your $75,000 investment with medium risk tolerance.
  
  *Running comprehensive analysis...*
  
  **🎯 Recommended Strategy: MEDIUM RISK**
  - Expected APY: 11.2%
  - Annual Return: $8,400
  - Risk Score: 52/100 🟡
  - Diversification: 5 protocols
  
  **Top 3 Allocations:**
  1. **Aave V3 USDC** - $30,000 (40%)
     - APY: 9.8% | Risk: 25/100 🟢
     - Battle-tested lending with $2.1B TVL
  
  2. **Curve 3Pool** - $22,500 (30%)
     - APY: 8.5% | Risk: 22/100 🟢
     - Stable LP with zero impermanent loss
  
  3. **Compound V3** - $22,500 (30%)
     - APY: 10.1% | Risk: 28/100 🟢
     - Variable lending with market upside
  
  **Market Conditions:** Moderate volatility (45/100) favors balanced approach.
  
  Ready to execute? I can autonomously deploy this strategy across Base chain with real-time monitoring and automated rebalancing.
  
  *Type "execute" to proceed with autonomous investment.*`
                }
            }
        ]
    ]
};
export class DeFiAIAgent {
    plugin;
    constructor() {
        this.plugin = new DeFiRiskManagerPlugin();
    }
    async analyzeInvestmentOpportunities(runtime, amount, options) {
        return this.plugin.analyzeInvestmentOpportunities(runtime, amount, options);
    }
    async executeAutonomousInvestment(amount, options) {
        return this.plugin.executeAutonomousInvestment(amount, options);
    }
    getCharacter() {
        return defiAICharacter;
    }
    getPlugin() {
        return this.plugin;
    }
}
export default {
    character: defiAICharacter,
    plugin: new DeFiRiskManagerPlugin(),
    agent: DeFiAIAgent
};
//# sourceMappingURL=agent.js.map