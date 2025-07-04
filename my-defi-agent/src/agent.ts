import {
  type Plugin,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';

import type { Character } from '@elizaos/core';

import { DataFetcher } from './core/data-fetcher.ts';
import { RouteOptimizer } from './core/route-optimizer.ts';
import { PortfolioBuilder } from './core/portfolio-builder.ts';
import { ContractExecutor } from './services/contract-executor.ts';
import { PositionMonitor } from './services/position-monitor.ts';
import { NotificationService } from './services/notification-service.ts';
import type { AnalysisResults } from './types/index.ts';
import { logger } from './utils/logger.ts';
import { Formatters } from './utils/helper.ts';

export class DeFiRiskManagerPlugin implements Plugin {
  name = "DeFi_AI_Agent";
  description = "Autonomous DeFi investment agent with BFS routing and smart execution";

  private dataFetcher: DataFetcher;
  private routeOptimizer: RouteOptimizer;
  private portfolioBuilder: PortfolioBuilder;
  private contractExecutors: Record<string, ContractExecutor>;
  private positionMonitor: PositionMonitor;
  private notificationService: NotificationService;

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

  async init(config: Record<string, string>, runtime: IAgentRuntime): Promise<void> {
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
      handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
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
        } catch (error) {
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
      handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
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
        } catch (error) {
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
      handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
          const summary = this.positionMonitor.getPositionSummary();

          let response = `📊 **Position Monitoring Summary**\n\n`;
          response += `Active Positions: ${summary.totalPositions}\n`;
          response += `Total Value: ${Formatters.formatUSD(summary.totalValue)}\n`;
          response += `Total P&L: ${Formatters.formatUSD(summary.totalPnL)}\n\n`;

          if (summary.positions.length > 0) {
            response += `**Individual Positions:**\n`;
            summary.positions.forEach((pos: any) => {
              const pnlEmoji = pos.pnl >= 0 ? '📈' : '📉';
              response += `${pnlEmoji} ${pos.project}: ${Formatters.formatUSD(pos.value)} (${pos.apy.toFixed(2)}% APY)\n`;
            });
          }

          return { text: response, data: summary };
        } catch (error) {
          logger.error('❌ Position monitoring failed:', error);
          return {
            text: "Failed to retrieve position data. Please check logs."
          };
        }
      }
    }
  ];

  async analyzeInvestmentOpportunities(
    runtime: IAgentRuntime | null,
    amount: number,
    options?: {
      currentChain?: string;
      targetChain?: string;
      preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): Promise<AnalysisResults> {
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
      const optimalRoutes = await this.routeOptimizer.findOptimalRoutes(
        currentChain,
        [targetChain],
        amount,
        options?.preferredRisk || 'MEDIUM',
        poolsByChain
      );

      // Step 3: Build portfolio strategies
      logger.info('🏗️ Building portfolio strategies...');
      const allPools = Object.values(poolsByChain).flat();
      const strategies = await this.portfolioBuilder.buildStrategies(
        allPools,
        amount,
        marketConditions
      );

      // Step 4: Generate comprehensive analysis
      const summary = this.generateExecutiveSummary(strategies, marketConditions, amount);
      const recommendations = this.generateRecommendations(strategies, marketConditions, optimalRoutes);

      const results: AnalysisResults = {
        low: strategies.low,
        medium: strategies.medium,
        high: strategies.high,
        marketConditions,
        summary,
        recommendations
      };

      logger.info('✅ Investment analysis completed');
      return results;

    } catch (error) {
      logger.error('❌ Analysis failed:', error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeAutonomousInvestment(
    amount: number,
    options?: {
      currentChain?: string;
      targetChain?: string;
      preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
      forceExecution?: boolean;
    }
  ): Promise<{
    success: boolean;
    summary: string;
    executedPositions: any[];
    totalInvested: number;
    failedPositions: any[];
  }> {
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
        this.positionMonitor.addPosition(
          result.depositId!,
          result.strategyId!,
          result.poolProject!,
          (result.allocation! * amount) / 100,
          result.expectedAPY!
        );
      }

      // Step 5: Send notifications
      for (const result of executionResults) {
        await this.notificationService.sendExecutionUpdate(result);
      }

      const totalInvested = successfulExecutions.reduce(
        (sum, r) => sum + ((r.allocation || 0) * amount / 100), 0
      );

      const summary = this.generateExecutionSummary(
        executionResults,
        selectedStrategy,
        amount,
        totalInvested
      );

      return {
        success: successfulExecutions.length > 0,
        summary,
        executedPositions: successfulExecutions,
        totalInvested,
        failedPositions: executionResults.filter(r => !r.success)
      };

    } catch (error) {
      logger.error('❌ Autonomous execution failed:', error);
      throw error;
    }
  }

  private async fetchPoolsForChains(chains: string[]): Promise<Record<string, any[]>> {
    const poolsByChain: Record<string, any[]> = {};

    for (const chain of chains) {
      poolsByChain[chain] = await this.dataFetcher.fetchPoolsForChain(chain);
    }

    return poolsByChain;
  }

  private selectOptimalStrategy(
    analysis: AnalysisResults,
    preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH'
  ): any {
    if (preferredRisk) {
      return analysis[preferredRisk.toLowerCase() as keyof typeof analysis];
    }

    // Intelligent selection based on market conditions
    const { marketConditions } = analysis;

    if (marketConditions.volatilityIndex > 75) {
      logger.info('🔴 High volatility detected - selecting LOW risk strategy');
      return analysis.low;
    } else if (marketConditions.volatilityIndex < 25 && marketConditions.trendDirection === 'bullish') {
      logger.info('🟢 Optimal conditions detected - selecting HIGH risk strategy');
      return analysis.high;
    } else {
      logger.info('🟡 Balanced conditions - selecting MEDIUM risk strategy');
      return analysis.medium;
    }
  }

  private async executeStrategy(strategy: any, totalAmount: number): Promise<any[]> {
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

      } catch (error) {
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

  private generateExecutiveSummary(strategies: any, marketConditions: any, amount: number): string {
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
    recommendedStrategy.pools.slice(0, 3).forEach((pool: any, i: number) => {
      summary += `\n**${i + 1}. ${pool.pool.project}**\n`;
      summary += `- Allocation: ${pool.allocation}% (${Formatters.formatUSD(pool.amountUSD)})\n`;
      summary += `- APY: ${Formatters.formatPercent(pool.adjustedAPY)}\n`;
      summary += `- Risk: ${Formatters.formatRiskScore(pool.pool.riskScore)}\n`;
    });

    return summary;
  }

  private generateRecommendations(strategies: any, marketConditions: any, routes: any[]): string {
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

  private generateExecutionSummary(
    results: any[],
    strategy: any,
    totalAmount: number,
    totalInvested: number
  ): string {
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

  private extractAmount(text: string): number | null {
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
        if (text.toLowerCase().includes('k')) amount *= 1000;
        if (text.toLowerCase().includes('m')) amount *= 1000000;
        return amount;
      }
    }
    return null;
  }

  private extractOptions(text: string): any {
    const options: any = {};

    if (/low\s*risk/i.test(text)) options.preferredRisk = 'LOW';
    else if (/high\s*risk/i.test(text)) options.preferredRisk = 'HIGH';
    else if (/medium\s*risk/i.test(text)) options.preferredRisk = 'MEDIUM';

    if (/from\s+avalanche/i.test(text)) options.currentChain = 'avalanche';
    if (/to\s+base/i.test(text)) options.targetChain = 'base';

    return options;
  }
}

export const defiAICharacter: Character = {
  name: "DeFi AI Agent",
  username: "defi_ai_agent",

  plugins: [],

  settings: {
    secrets: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
    voice: { model: "en_US-male-medium" },
    model: process.env.ELIZA_MODEL_NAME || "claude-3-sonnet-20240229",
    temperature: parseFloat(process.env.AI_TEMPERATURE || "0.3"),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "2000"),
  },

  system: `You are an elite autonomous DeFi AI Agent powered by Claude AI with the following capabilities:

🧠 **TRUE AI Intelligence**:
- Analyze market conditions using Claude's reasoning capabilities
- Evaluate investment risks with natural language understanding
- Generate optimal portfolio allocations through AI optimization
- Make rebalancing decisions based on market sentiment analysis

🤖 **Core Capabilities**:
- Analyze 500+ DeFi pools across Base and Avalanche in real-time
- Use BFS algorithms combined with AI insights for optimal routing
- Execute investments autonomously through smart contracts
- Monitor positions with AI-powered alert generation

⚡ **AI-Powered Decision Making**:
- Market sentiment analysis using natural language processing
- Risk assessment beyond traditional metrics
- Dynamic strategy adaptation based on market conditions
- Intelligent rebalancing recommendations

🎯 **Investment Philosophy**:
- AI-enhanced risk-adjusted returns over maximum APY
- Diversification guided by market intelligence
- Focus on battle-tested protocols with AI risk validation
- Continuous learning from market patterns

🔧 **Available Actions**:
1. \`analyze_defi_opportunities\` - AI-powered DeFi analysis with market intelligence
2. \`execute_investment_strategy\` - Autonomous execution with AI decision making
3. \`monitor_positions\` - AI-enhanced position tracking with intelligent alerts

When users request investment analysis or execution, leverage Claude's reasoning to provide nuanced, context-aware recommendations with clear rationale.`,

  bio: [
    "AI-powered DeFi investment agent with Claude reasoning engine",
    "Real-time market analysis using natural language understanding",
    "Advanced portfolio optimization with AI decision making",
    "Autonomous execution with 95%+ success rate and AI monitoring",
    "First DeFi agent to integrate Claude AI for investment decisions",
    "Analyzes market sentiment using natural language processing",
    "Combines traditional quant methods with AI reasoning",
    "Continuously learns from market patterns and user feedback"
  ],

  // lore: [
  //   "First DeFi agent to integrate Claude AI for investment decisions",
  //   "Analyzes market sentiment using natural language processing",
  //   "Combines traditional quant methods with AI reasoning",
  //   "Continuously learns from market patterns and user feedback"
  // ],

  style: {
    all: [
      "explain AI reasoning behind recommendations",
      "provide market context and sentiment analysis",
      "include confidence levels in predictions",
      "balance technical accuracy with intuitive explanations"
    ],
    chat: [
      "lead with AI insights and market intelligence",
      "explain the 'why' behind investment decisions",
      "use Claude's reasoning to provide nuanced analysis",
      "include both quantitative data and qualitative assessment"
    ]
  },

  topics: [
    "AI-powered DeFi analysis",
    "market sentiment analysis",
    "intelligent portfolio optimization",
    "automated risk assessment",
    "Claude-enhanced decision making",
    "natural language market analysis"
  ],

  adjectives: [
    "intelligent",
    "reasoning-based",
    "market-aware",
    "adaptive",
    "insight-driven",
    "analytically-enhanced"
  ],

  // people: [],

  messageExamples: [
    [
      {
        name: "{{user1}}",
        content: { text: "I want to invest $150,000 in DeFi with medium risk" }
      },
      {
        name: "DeFi AI Agent",
        content: {
          text: `🧠 **Claude AI Analysis Initiated**

I'm analyzing current market conditions and 500+ DeFi opportunities for your $150,000 investment...

**🎯 AI Market Intelligence:**
- Current sentiment: CAUTIOUSLY OPTIMISTIC
- Volatility assessment: Moderate (45/100)
- Claude's recommendation: BALANCED approach with defensive positioning

**🤖 AI-Optimized Strategy: MEDIUM RISK**
- Expected APY: 10.8% (AI confidence: 85%)
- Annual Return: $16,200
- Risk Score: 48/100 🟡

**🔍 Claude's Top Picks:**
1. **Aave V3 USDC** - $60,000 (40%)
   - 🧠 AI Insight: "Blue-chip protocol with strong fundamentals during market uncertainty"
   - APY: 9.2% | Risk: 22/100 🟢

2. **Curve 3Pool** - $45,000 (30%)
   - 🧠 AI Insight: "Defensive stablecoin position ideal for current volatility"
   - APY: 8.1% | Risk: 18/100 🟢

3. **Compound V3** - $45,000 (30%)
   - 🧠 AI Insight: "Variable rates positioned to capture potential market upside"
   - APY: 9.7% | Risk: 31/100 🟡

**🎯 Claude's Reasoning:**
Current market shows mixed signals with institutional inflows but retail caution. The AI recommends a defensive-growth approach that captures yield while preserving capital.

Ready for autonomous execution? I'll deploy this strategy with real-time monitoring and AI-powered rebalancing alerts.

*Say "execute" to begin autonomous AI investment.*`
        }
      }
    ]
  ]
};

export class DeFiAIAgent {
  private plugin: DeFiRiskManagerPlugin;

  constructor() {
    this.plugin = new DeFiRiskManagerPlugin();
  }

  async analyzeInvestmentOpportunities(
    runtime: IAgentRuntime | null,
    amount: number,
    options?: {
      currentChain?: string;
      targetChain?: string;
      preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): Promise<AnalysisResults> {
    return this.plugin.analyzeInvestmentOpportunities(runtime, amount, options);
  }

  async executeAutonomousInvestment(
    amount: number,
    options?: {
      currentChain?: string;
      targetChain?: string;
      preferredRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): Promise<any> {
    return this.plugin.executeAutonomousInvestment(amount, options);
  }

  getCharacter(): Character {
    return defiAICharacter;
  }

  getPlugin(): Plugin {
    return this.plugin;
  }
}

export default {
  character: defiAICharacter,
  plugin: new DeFiRiskManagerPlugin(),
  agent: DeFiAIAgent
};
