// src/core/ai-decision-engine.ts
import Anthropic from '@anthropic-ai/sdk';
import type { PoolData, MarketConditions } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { Formatters } from '../utils/helper.ts';

export class AIDecisionEngine {
  private anthropic: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for AI decision making');
    }
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    logger.info('🧠 AI Decision Engine initialized with Claude');
  }

  async analyzeMarketConditions(rawData: any): Promise<{
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    reasoning: string[];
    riskAdjustment: number;
    recommendedAction: 'AGGRESSIVE' | 'CONSERVATIVE' | 'BALANCED';
    marketPhase: string;
  }> {
    const prompt = `You are an elite DeFi investment analyst with 10+ years experience. Analyze these market conditions:

MARKET DATA:
- Volatility Index: ${rawData.volatilityIndex}/100
- Trend Direction: ${rawData.trendDirection}
- Gas Prices: ${rawData.gasPrice} gwei
- Total DeFi TVL: $${(rawData.totalTVL / 1e9).toFixed(1)}B
- Top Sectors: ${rawData.topPerformingSectors.join(', ')}
- Fear & Greed: ${rawData.marketFear}/100

Provide your analysis in this exact JSON format:
{
  "sentiment": "BULLISH",
  "confidence": 0.85,
  "reasoning": ["Clear reasoning point 1", "Clear reasoning point 2", "Clear reasoning point 3"],
  "riskAdjustment": 1.2,
  "recommendedAction": "AGGRESSIVE",
  "marketPhase": "accumulation"
}

Be decisive and specific. Focus on actionable insights for DeFi investment decisions.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const analysis = JSON.parse(content.text);
        logger.info(`🧠 Claude Market Analysis: ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}% confidence)`);
        return analysis;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error('❌ Claude market analysis failed:', error);
      return this.getFallbackMarketAnalysis();
    }
  }

  async evaluatePoolRisk(pool: PoolData, marketContext: any): Promise<{
    aiRiskScore: number;
    reasoning: string[];
    redFlags: string[];
    opportunities: string[];
    recommendation: 'AVOID' | 'CAUTION' | 'MODERATE' | 'RECOMMENDED';
    maxAllocation: number;
  }> {
    const prompt = `As a DeFi risk expert, evaluate this investment opportunity:

POOL DETAILS:
- Protocol: ${pool.project}
- Pool Type: ${pool.poolType}
- APY: ${pool.apy}%
- TVL: $${(pool.tvlUsd / 1e6).toFixed(1)}M
- Risk Score: ${pool.riskScore}/100
- Protocol Age: ${pool.protocolAge} days
- Audit Status: ${pool.audits}
- Impermanent Loss Risk: ${pool.ilRisk}

MARKET CONTEXT:
- Volatility: ${marketContext.volatilityIndex}/100
- Sentiment: ${marketContext.sentiment}

Analyze and respond in this exact JSON format:
{
  "aiRiskScore": 45,
  "reasoning": ["Key factor 1", "Key factor 2"],
  "redFlags": ["Potential risk 1", "Potential risk 2"],
  "opportunities": ["Why invest reason 1", "Why invest reason 2"],
  "recommendation": "MODERATE",
  "maxAllocation": 25
}

Focus on practical risk assessment for a $50K+ investment.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const analysis = JSON.parse(content.text);
        logger.debug(`🔍 Claude Risk Analysis for ${pool.project}: ${analysis.recommendation}`);
        return analysis;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error(`❌ Claude risk evaluation failed for ${pool.project}:`, error);
      return this.getFallbackRiskAnalysis(pool);
    }
  }

  async optimizePortfolio(
    pools: PoolData[],
    amount: number,
    riskTolerance: string,
    marketAnalysis: any
  ): Promise<{
    allocations: Array<{ pool: PoolData; percentage: number; reasoning: string }>;
    strategy: string;
    expectedAPY: number;
    riskScore: number;
    aiRecommendations: string[];
  }> {
    const topPools = pools.slice(0, 10); // Limit to top 10 for analysis
    
    const prompt = `You are a portfolio optimization expert. Create an optimal DeFi portfolio:

INVESTMENT PARAMETERS:
- Amount: $${amount.toLocaleString()}
- Risk Tolerance: ${riskTolerance}
- Market Sentiment: ${marketAnalysis.sentiment}
- Market Action: ${marketAnalysis.recommendedAction}

AVAILABLE POOLS:
${topPools.map((pool, i) => `
${i + 1}. ${pool.project} (${pool.poolType})
   - APY: ${pool.apy}%
   - TVL: $${(pool.tvlUsd / 1e6).toFixed(1)}M
   - Risk: ${pool.riskScore}/100
   - Age: ${pool.protocolAge} days`).join('')}

Create an optimal portfolio allocation in this JSON format:
{
  "allocations": [
    {
      "poolIndex": 0,
      "percentage": 40,
      "reasoning": "Why this allocation"
    }
  ],
  "strategy": "Conservative diversification across blue-chip protocols",
  "expectedAPY": 9.2,
  "riskScore": 35,
  "aiRecommendations": [
    "Consider rebalancing in 30 days",
    "Monitor gas costs on execution"
  ]
}

Ensure allocations sum to 100%. Limit to 5 pools maximum. Focus on risk-adjusted returns.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const optimization = JSON.parse(content.text);
        
        // Map pool indices back to actual pools
        const allocations = optimization.allocations.map((alloc: any) => ({
          pool: topPools[alloc.poolIndex],
          percentage: alloc.percentage,
          reasoning: alloc.reasoning
        }));

        logger.info(`🎯 Claude Portfolio Optimization: ${optimization.strategy}`);
        return {
          ...optimization,
          allocations
        };
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error('❌ Claude portfolio optimization failed:', error);
      return this.getFallbackPortfolioOptimization(pools, riskTolerance);
    }
  }

  async shouldRebalance(
    currentPositions: any[],
    marketConditions: any
  ): Promise<{
    shouldRebalance: boolean;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendations: string[];
    suggestedActions: Array<{
      action: 'INCREASE' | 'DECREASE' | 'EXIT' | 'HARVEST';
      position: string;
      percentage: number;
      reasoning: string;
    }>;
  }> {
    const prompt = `As a DeFi portfolio manager, analyze if rebalancing is needed:

CURRENT POSITIONS:
${currentPositions.map((pos, i) => `
${i + 1}. ${pos.project}: $${pos.value.toLocaleString()}
   - Current APY: ${pos.apy.toFixed(2)}%
   - P&L: ${pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}%
   - Days held: ${pos.daysHeld}`).join('')}

MARKET CONDITIONS:
- Volatility: ${marketConditions.volatilityIndex}/100
- Sentiment: ${marketConditions.sentiment}
- Trend: ${marketConditions.trendDirection}

Analyze and respond in JSON:
{
  "shouldRebalance": true,
  "urgency": "MEDIUM",
  "recommendations": ["Specific action 1", "Specific action 2"],
  "suggestedActions": [
    {
      "action": "DECREASE",
      "position": "Aave USDC",
      "percentage": 10,
      "reasoning": "Why decrease this position"
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const rebalanceAnalysis = JSON.parse(content.text);
        logger.info(`⚖️ Claude Rebalance Analysis: ${rebalanceAnalysis.shouldRebalance ? 'REBALANCE NEEDED' : 'HOLD CURRENT'}`);
        return rebalanceAnalysis;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error('❌ Claude rebalancing analysis failed:', error);
      return {
        shouldRebalance: false,
        urgency: 'LOW',
        recommendations: ['Monitor positions for 24h'],
        suggestedActions: []
      };
    }
  }

  async evaluateExecutionTiming(
    strategy: any,
    marketConditions: any
  ): Promise<{
    shouldExecuteNow: boolean;
    confidence: number;
    reasoning: string[];
    alternativeTiming: string;
    riskFactors: string[];
  }> {
    const prompt = `As a DeFi execution expert, analyze if this is the right time to execute this investment strategy:

STRATEGY DETAILS:
- Risk Level: ${strategy.riskLevel}
- Expected APY: ${strategy.totalExpectedAPY}%
- Risk Score: ${strategy.totalRiskScore}/100
- Number of Positions: ${strategy.pools.length}
- Total Amount: $${strategy.estimatedAnnualReturn * 100 / strategy.totalExpectedAPY}

TOP ALLOCATIONS:
${strategy.pools.slice(0, 3).map((pool: any, i: number) => `
${i + 1}. ${pool.pool.project}: ${pool.allocation}% (${pool.adjustedAPY}% APY)`).join('')}

MARKET CONDITIONS:
- Volatility: ${marketConditions.volatilityIndex}/100
- Gas Price: ${marketConditions.gasPrice} gwei
- Trend: ${marketConditions.trendDirection}

Respond in JSON:
{
  "shouldExecuteNow": true,
  "confidence": 0.85,
  "reasoning": ["Market timing favorable", "Gas costs reasonable"],
  "alternativeTiming": "Wait for lower gas prices in 6-12 hours",
  "riskFactors": ["High volatility may affect execution"]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const timing = JSON.parse(content.text);
        logger.info(`⏰ Claude Execution Timing: ${timing.shouldExecuteNow ? 'EXECUTE NOW' : 'WAIT'} (${(timing.confidence * 100).toFixed(0)}% confidence)`);
        return timing;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error('❌ Claude execution timing failed:', error);
      return {
        shouldExecuteNow: true,
        confidence: 0.5,
        reasoning: ['Fallback timing analysis'],
        alternativeTiming: 'Execute when ready',
        riskFactors: ['AI analysis unavailable']
      };
    }
  }

  async generateInvestmentReport(
    strategy: any,
    executionResults: any[],
    marketContext: any
  ): Promise<{
    executiveSummary: string;
    performanceAnalysis: string;
    riskAssessment: string;
    nextSteps: string[];
    confidenceLevel: number;
  }> {
    const successfulInvestments = executionResults.filter(r => r.success);
    const totalInvested = successfulInvestments.reduce((sum, r) => sum + (r.allocation || 0), 0);

    const prompt = `As a DeFi investment analyst, create a comprehensive report on this investment execution:

STRATEGY EXECUTED:
- Risk Level: ${strategy.riskLevel}
- Target APY: ${strategy.totalExpectedAPY}%
- Planned Investments: ${strategy.pools.length}

EXECUTION RESULTS:
- Successful: ${successfulInvestments.length}/${executionResults.length}
- Total Invested: ${totalInvested}%
${executionResults.map((r, i) => `
${i + 1}. ${r.poolProject}: ${r.success ? '✅' : '❌'} ${r.success ? `(${r.expectedAPY}% APY)` : `(${r.error})`}`).join('')}

MARKET CONTEXT:
- Volatility: ${marketContext.volatilityIndex}/100
- Sentiment: ${marketContext.sentiment}

Create a professional report in JSON:
{
  "executiveSummary": "Brief overview of execution and outlook",
  "performanceAnalysis": "Analysis of expected returns and risk positioning",
  "riskAssessment": "Current risk factors and portfolio health",
  "nextSteps": ["Action 1", "Action 2", "Action 3"],
  "confidenceLevel": 0.85
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const report = JSON.parse(content.text);
        logger.info(`📊 Claude generated investment report with ${(report.confidenceLevel * 100).toFixed(0)}% confidence`);
        return report;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      logger.error('❌ Claude report generation failed:', error);
      return {
        executiveSummary: 'Investment execution completed with mixed results. AI analysis unavailable.',
        performanceAnalysis: 'Portfolio positioned for moderate returns based on selected protocols.',
        riskAssessment: 'Risk profile aligns with strategy objectives. Monitor for market changes.',
        nextSteps: ['Monitor positions daily', 'Review performance weekly', 'Consider rebalancing in 30 days'],
        confidenceLevel: 0.5
      };
    }
  }

  // Fallback methods for when AI fails
  private getFallbackMarketAnalysis() {
    return {
      sentiment: 'NEUTRAL' as const,
      confidence: 0.5,
      reasoning: ['AI analysis unavailable', 'Using conservative fallback'],
      riskAdjustment: 1.0,
      recommendedAction: 'BALANCED' as const,
      marketPhase: 'uncertain'
    };
  }

  private getFallbackRiskAnalysis(pool: PoolData) {
    return {
      aiRiskScore: pool.riskScore,
      reasoning: ['Fallback analysis based on quantitative metrics', 'AI unavailable'],
      redFlags: pool.riskScore > 60 ? ['High risk score detected'] : [],
      opportunities: pool.apy > 10 ? ['Above-average APY opportunity'] : ['Stable yield opportunity'],
      recommendation: pool.riskScore < 40 ? 'RECOMMENDED' as const : 
                     pool.riskScore < 70 ? 'MODERATE' as const : 'CAUTION' as const,
      maxAllocation: Math.max(10, 50 - pool.riskScore / 2)
    };
  }

  private getFallbackPortfolioOptimization(pools: PoolData[], riskTolerance: string) {
    const numPools = riskTolerance === 'LOW' ? 3 : riskTolerance === 'MEDIUM' ? 4 : 5;
    const topPools = pools.slice(0, numPools);
    const baseAllocation = 100 / topPools.length;
    
    return {
      allocations: topPools.map(pool => ({
        pool,
        percentage: Math.round(baseAllocation),
        reasoning: `Equal weight allocation in ${pool.project} based on quantitative metrics`
      })),
      strategy: `${riskTolerance} risk equal-weight diversification across top protocols`,
      expectedAPY: topPools.reduce((sum, pool) => sum + pool.apy, 0) / topPools.length,
      riskScore: topPools.reduce((sum, pool) => sum + pool.riskScore, 0) / topPools.length,
      aiRecommendations: ['AI analysis unavailable - using quantitative fallback', 'Monitor positions closely', 'Consider manual review of allocations']
    };
  }

  // Utility method to test AI connection
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: 'Respond with "AI connection successful" if you can read this.'
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text' && content.text.includes('successful')) {
        logger.info('✅ Claude AI connection test passed');
        return true;
      }
      
      throw new Error('Unexpected response');
    } catch (error) {
      logger.error('❌ Claude AI connection test failed:', error);
      return false;
    }
  }
}