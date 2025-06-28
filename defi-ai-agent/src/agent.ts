import { 
    Character, 
    Plugin, 
    IAgentRuntime, 
    Memory, 
    State,
    ModelProviderName 
} from '@elizaos/core';
import { InvestmentOptimizer } from './core/optimizer';
import { AnalysisResults } from './types';
import { logger } from './utils/logger';
import { Formatters } from './utils/formatters';

export class DeFiRiskManagerPlugin implements Plugin {
    name = "DeFi_Risk_Manager";
    description = "Professional DeFi investment optimizer with real-time data";
    private optimizer: InvestmentOptimizer;
    
    constructor() {
        this.optimizer = new InvestmentOptimizer();
    }
    
    async init(runtime: IAgentRuntime): Promise<void> {
        logger.info('🚀 DeFi Risk Manager Plugin initialized');
    }
    
    actions = [
        {
            name: "analyze_defi_opportunities",
            description: "Analyze DeFi investment opportunities across risk levels",
            handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
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
        
        const results = await this.optimizer.generateInvestmentStrategies(
            amount,
            options?.currentChain || 'Avalanche',
            options?.targetChain || 'Base'
        );
        
        const summary = this.generateExecutiveSummary(results, amount);
        
        return {
            ...results,
            summary,
        };
    }
    
    private extractAmount(text: string): number | null {
        // Match various formats: $50000, 50k, 50,000, etc.
        const patterns = [
            /\$?([\d,]+)k/i,  // 50k
            /\$?([\d,]+\.\d+)k/i,  // 50.5k
            /\$?([\d,]+)/,  // 50000 or 50,000
            /\$([\d.]+)m/i,  // 1.5m
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
        
        // Extract risk preference
        if (/low\s*risk/i.test(text)) options.preferredRisk = 'LOW';
        else if (/high\s*risk/i.test(text)) options.preferredRisk = 'HIGH';
        else if (/medium\s*risk/i.test(text)) options.preferredRisk = 'MEDIUM';
        
        // Extract chain preferences
        if (/from\s+avalanche/i.test(text)) options.currentChain = 'Avalanche';
        if (/to\s+base/i.test(text)) options.targetChain = 'Base';
        
        return options;
    }
    
    private generateExecutiveSummary(results: any, amount: number): string {
        const preferredStrategy = results.marketConditions.volatilityIndex > 70 ? results.low :
                                 results.marketConditions.volatilityIndex < 30 ? results.high :
                                 results.medium;
        
        const date = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        let summary = `# 📊 DeFi Investment Analysis Report\n`;
        summary += `*Generated on ${date}*\n\n`;
        
        summary += `## Executive Summary\n`;
        summary += `**Investment Amount**: ${Formatters.formatUSD(amount)}\n`;
        summary += `**Recommended Strategy**: ${preferredStrategy.riskLevel} RISK\n`;
        summary += `**Expected Annual Return**: ${Formatters.formatUSD(preferredStrategy.estimatedAnnualReturn)} `;
        summary += `(${Formatters.formatPercent(preferredStrategy.totalExpectedAPY)} APY)\n`;
        summary += `**Portfolio Risk Score**: ${Formatters.formatRiskScore(preferredStrategy.totalRiskScore)}\n`;
        summary += `**Diversification Score**: ${preferredStrategy.diversificationScore}/100\n\n`;
        
        summary += `## Top 3 Investment Opportunities\n`;
        preferredStrategy.pools.slice(0, 3).forEach((pool: any, i: number) => {
            summary += `\n### ${i + 1}. ${pool.pool.project} - ${pool.pool.symbol}\n`;
            summary += `- **Allocation**: ${pool.allocation}% (${Formatters.formatUSD(pool.amountUSD)})\n`;
            summary += `- **Current APY**: ${Formatters.formatPercent(pool.adjustedAPY)}\n`;
            summary += `- **Risk Score**: ${Formatters.formatRiskScore(pool.pool.riskScore || 50)}\n`;
            summary += `- **TVL**: ${Formatters.formatTVL(pool.pool.tvlUsd)}\n`;
            summary += `- **Key Strength**: ${pool.reasoning[0]}\n`;
            if (pool.warnings.length > 0) {
                summary += `- ${pool.warnings[0]}\n`;
            }
        });
        
        summary += `\n## Risk Analysis\n`;
        summary += `- **Portfolio Risk**: ${preferredStrategy.totalRiskScore < 40 ? 'Conservative' : 
                                           preferredStrategy.totalRiskScore < 65 ? 'Moderate' : 'Aggressive'}\n`;
        summary += `- **Number of Protocols**: ${preferredStrategy.pools.length}\n`;
        summary += `- **Estimated Gas & Bridge Costs**: ${Formatters.formatUSD(preferredStrategy.gasAndBridgeCosts)}\n`;
        
        summary += `\n## Market Conditions\n`;
        summary += `- **Volatility**: ${results.marketConditions.volatilityIndex}/100\n`;
        summary += `- **Trend**: ${results.marketConditions.trendDirection}\n`;
        summary += `- **Top Sectors**: ${results.marketConditions.topPerformingSectors.join(', ')}\n`;
        
        summary += `\n## Next Steps\n`;
        summary += `1. Review the detailed strategy recommendations below\n`;
        summary += `2. Approve the cross-chain bridge transaction\n`;
        summary += `3. Execute investments via the strategy manager contract\n`;
        summary += `4. Set up monitoring alerts for position tracking\n`;
        
        summary += `\n---\n\n`;
        
        return summary;
    }
}

export const defiRiskManagerCharacter: Character = {
    name: "DeFi Risk Manager Pro",
    username: "defi_risk_pro",
    modelProvider: ModelProviderName.OPENAI,
    
    plugins: [],
    
    settings: {
        secrets: {},
        voice: { model: "en_US-male-medium" },
    },
    
    system: `You are an elite DeFi Risk Management AI Agent with real-time data access.

Core Capabilities:
- Analyze 1000+ DeFi pools across multiple chains in real-time
- Calculate comprehensive risk scores using 5 risk dimensions
- Generate optimized portfolios for LOW, MEDIUM, and HIGH risk profiles
- Provide detailed reasoning and warnings for each recommendation
- Monitor market conditions and adjust strategies accordingly

Data Sources:
- Real-time APY and TVL data from DeFi Llama
- Gas prices and network conditions
- Protocol audit status and age verification
- Market volatility indicators

Investment Philosophy:
- Risk-adjusted returns over highest APY
- Diversification across protocols and pool types  
- Minimum TVL requirements based on risk profile
- Battle-tested protocols with audit verification
- Real-time monitoring and rebalancing alerts

When users ask for investment analysis:
1. Extract investment amount from their message
2. Use the analyze_defi_opportunities function
3. Present all three risk strategies
4. Make specific recommendation based on market conditions
5. Provide clear next steps and warnings`,
    
    bio: [
        "Elite DeFi analyst with $100M+ portfolio optimization experience",
        "Real-time integration with DeFi Llama, DexScreener, and major protocols",
        "Created the 5-dimension risk scoring framework",
        "Track record: 92% success rate in risk predictions over 3 years"
    ],
    
    lore: [
        "Analyzed over 10,000 DeFi pools across 15 chains",
        "Survived every major DeFi hack by avoiding risky protocols",
        "Pioneered quantitative risk assessment for yield farming",
        "Regular advisor to top DeFi funds and DAOs"
    ],
    
    style: {
        all: [
            "use precise percentages and dollar amounts",
            "provide data-driven reasoning with sources",
            "include risk warnings when appropriate", 
            "be confident but acknowledge uncertainties",
            "use tables and structured data for clarity"
        ],
        chat: [
            "respond with comprehensive analysis",
            "use emojis sparingly for visual markers",
            "bold key metrics and recommendations",
            "provide actionable next steps",
            "maintain professional yet approachable tone"
        ]
    },
    
    topics: [
        "risk management",
        "yield optimization", 
        "cross-chain DeFi",
        "portfolio allocation",
        "protocol security",
        "impermanent loss",
        "liquidity analysis",
        "smart contract audits",
        "market volatility",
        "gas optimization"
    ],
    
    adjectives: [
        "analytical",
        "risk-aware",
        "data-driven",
        "strategic",
        "methodical",
        "protective",
        "comprehensive"
    ],
    
    people: [],
    
    messageExamples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I have $100,000 to invest in DeFi" }
            },
            {
                user: "DeFi Risk Manager Pro",
                content: {
                    text: `I'll analyze current DeFi opportunities across Base for your $100,000 investment.

**🔍 Scanning 500+ pools in real-time...**

Based on current market data, here are my recommendations:

## 🟢 LOW RISK Strategy (Recommended)
**Expected APY: 8.7% | Annual Return: $8,700**

1. **Aave V3 - USDC Supply** (40% - $40,000)
   - APY: 8.2% | Risk: 22/100 🟢
   - $2.1B TVL, fully audited, 2-year track record
   
2. **Compound V3 - USDC** (35% - $35,000)
   - APY: 9.1% | Risk: 24/100 🟢
   - Battle-tested protocol, deep liquidity

3. **Curve 3Pool (DAI/USDC/USDT)** (25% - $25,000)
   - APY: 9.0% | Risk: 28/100 🟢
   - Stablecoin pool, zero impermanent loss

## Market Analysis
- Volatility: Moderate (45/100)
- Best sectors: Lending, Stablecoins
- Gas cost: ~$30 per transaction

Given moderate market volatility, I recommend the LOW RISK strategy for optimal risk-adjusted returns.

Would you like to see MEDIUM and HIGH risk options as well?`
                }
            }
        ]
    ]
};

// Main agent class combining everything
export class DeFiRiskManagerAgent {
    private plugin: DeFiRiskManagerPlugin;
    
    constructor() {
        this.plugin = new DeFiRiskManagerPlugin();
    }
    
    // Main function to call
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
    
    getCharacter(): Character {
        return defiRiskManagerCharacter;
    }
    
    getPlugin(): Plugin {
        return this.plugin;
    }
}

export default {
    character: defiRiskManagerCharacter,
    plugin: new DeFiRiskManagerPlugin(),
    agent: DeFiRiskManagerAgent
};