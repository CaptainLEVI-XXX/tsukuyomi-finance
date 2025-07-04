import axios from 'axios';
import type { PoolData, MarketConditions } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { STRATEGY_MAPPING } from '../utils/constant.ts';

export class DataFetcher {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async fetchPoolsForChain(chain: string): Promise<PoolData[]> {
    const cacheKey = `pools_${chain}`;
    const cached = this.getFromCache(cacheKey);
    // if (cached) return cached;

    try {
      logger.info(`🔍 Fetching pools for ${chain}...`);

      const [defiLlamaData, directData] = await Promise.all([
        this.fetchDefiLlamaData(chain),
        this.fetchDirectProtocolData(chain)
      ]);

      const allPools = [...defiLlamaData, ...directData];
      const enrichedPools = this.enrichPoolData(allPools);

      this.setCache(cacheKey, enrichedPools);
      logger.info(`✅ Found ${enrichedPools.length} pools for ${chain}`);

      return enrichedPools;
    } catch (error) {
      logger.error(`❌ Error fetching pools for ${chain}:`, error);
      return [];
    }
  }

  async fetchMarketConditions(): Promise<MarketConditions> {
    const cacheKey = 'market_conditions';
    const cached = this.getFromCache(cacheKey);
    // if (cached) return cached;

    try {
      logger.info('📊 Fetching market conditions...');

      const [volatility, trends, gas] = await Promise.all([
        this.fetchVolatilityData(),
        this.fetchMarketTrends(),
        this.fetchGasData()
      ]);

      const conditions: MarketConditions = {
        volatilityIndex: volatility.index,
        trendDirection: trends.direction,
        gasPrice: gas.average,
        bridgeCosts: gas.bridge,
        topPerformingSectors: trends.sectors,
        marketFear: volatility.fear,
        totalTVL: trends.totalTVL
      };

      this.setCache(cacheKey, conditions);
      return conditions;
    } catch (error) {
      logger.error('❌ Error fetching market conditions:', error);
      return this.getDefaultMarketConditions();
    }
  }

  private async fetchDefiLlamaData(chain: string): Promise<PoolData[]> {
    const chainMapping: Record<string, string> = {
      'base': 'base',
      'avalanche': 'avalanche'
    };

    const chainId = chainMapping[chain.toLowerCase()];
    if (!chainId) return [];

    try {
      const response = await axios.get('https://yields.llama.fi/pools', {
        params: { chain: chainId },
        timeout: 15000
      });

      return response.data.data
        .filter((pool: any) => pool.tvlUsd > 1000000) // Min $1M TVL
        .map((pool: any) => this.transformDefiLlamaPool(pool))
        .slice(0, 100); // Top 100 pools
    } catch (error) {
      logger.warn('⚠️ DeFi Llama API error:', error);
      return [];
    }
  }

  private async fetchDirectProtocolData(chain: string): Promise<PoolData[]> {
    // Simulate direct protocol data fetching
    const mockPools: PoolData[] = [
      {
        id: `aave-usdc-${chain}`,
        symbol: 'aUSDC',
        project: 'Aave',
        chain,
        apy: 8.5,
        apyBase: 8.5,
        tvlUsd: 2500000000,
        poolType: 'lendingVariable',
        riskScore: 25,
        underlyingTokens: ['USDC'],
        protocolAge: 1200,
        audits: 'audited',
        ilRisk: false,
        exposure: 'single',
        strategyId: STRATEGY_MAPPING.Aave
      },
      {
        id: `compound-usdc-${chain}`,
        symbol: 'cUSDCv3',
        project: 'Compound',
        chain,
        apy: 9.2,
        apyBase: 9.2,
        tvlUsd: 1800000000,
        poolType: 'lendingVariable',
        riskScore: 28,
        underlyingTokens: ['USDC'],
        protocolAge: 1500,
        audits: 'audited',
        ilRisk: false,
        exposure: 'single',
        strategyId: STRATEGY_MAPPING.Compound
      },
      {
        id: `curve-3pool-${chain}`,
        symbol: '3CRV',
        project: 'Curve',
        chain,
        apy: 7.8,
        apyBase: 7.8,
        tvlUsd: 3200000000,
        poolType: 'stable',
        riskScore: 22,
        underlyingTokens: ['USDC', 'USDT', 'DAI'],
        protocolAge: 1400,
        audits: 'audited',
        ilRisk: false,
        exposure: 'multi',
        strategyId: STRATEGY_MAPPING.Curve
      }
    ];

    return mockPools;
  }

  private transformDefiLlamaPool(pool: any): PoolData {
    return {
      id: pool.pool,
      symbol: pool.symbol || '',
      project: pool.project || 'Unknown',
      chain: pool.chain || '',
      apy: pool.apy || 0,
      apyBase: pool.apyBase || 0,
      apyReward: pool.apyReward || 0,
      tvlUsd: pool.tvlUsd || 0,
      poolType: this.categorizePoolType(pool),
      riskScore: this.calculateRiskScore(pool),
      underlyingTokens: pool.underlyingTokens || [],
      protocolAge: pool.inception ?
        Math.floor((Date.now() - new Date(pool.inception).getTime()) / (1000 * 60 * 60 * 24)) : 365,
      audits: pool.audits ? 'audited' : 'unknown',
      ilRisk: pool.ilRisk || false,
      exposure: pool.exposure || 'single',
      url: pool.url,
      strategyId: this.getStrategyId(pool.project)
    };
  }

  private enrichPoolData(pools: PoolData[]): PoolData[] {
    return pools.map(pool => ({
      ...pool,
      strategyId: pool.strategyId || this.getStrategyId(pool.project)
    }));
  }

  private categorizePoolType(pool: any): PoolData['poolType'] {
    const symbol = pool.symbol?.toLowerCase() || '';
    const project = pool.project?.toLowerCase() || '';

    if (project.includes('aave') || project.includes('compound')) {
      return 'lendingVariable';
    }
    if (symbol.includes('usdc') && symbol.includes('usdt')) {
      return 'stable';
    }
    if (symbol.includes('-')) {
      return symbol.includes('eth') || symbol.includes('btc') ? 'lpVolatile' : 'lpStable';
    }
    return 'lendingVariable';
  }

  private calculateRiskScore(pool: any): number {
    let risk = 50;

    // TVL factor
    if (pool.tvlUsd > 1000000000) risk -= 15;
    else if (pool.tvlUsd > 100000000) risk -= 8;
    else if (pool.tvlUsd < 10000000) risk += 20;

    // APY factor
    if (pool.apy > 50) risk += 25;
    else if (pool.apy > 20) risk += 15;
    else if (pool.apy < 5) risk -= 5;

    // Project safety
    const safeProjects = ['aave', 'compound', 'curve', 'uniswap'];
    if (safeProjects.some(p => pool.project?.toLowerCase().includes(p))) {
      risk -= 15;
    }

    if (pool.ilRisk) risk += 10;

    return Math.max(5, Math.min(95, risk));
  }

  private getStrategyId(projectName: string): number {
    for (const [key, value] of Object.entries(STRATEGY_MAPPING)) {
      if (projectName?.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    return 10; // Default fallback
  }

  private async fetchVolatilityData(): Promise<{ index: number; fear: number }> {
    try {
      // Mock volatility calculation
      const btcPrice = await this.fetchBTCPrice();
      const volatility = Math.random() * 100; // Simplified
      return { index: volatility, fear: 100 - volatility };
    } catch {
      return { index: 45, fear: 55 };
    }
  }

  private async fetchMarketTrends(): Promise<any> {
    return {
      direction: ['bullish', 'bearish', 'neutral'][Math.floor(Math.random() * 3)],
      sectors: ['Lending', 'DEX', 'Stablecoins', 'Derivatives'],
      totalTVL: 180000000000
    };
  }

  private async fetchGasData(): Promise<{ average: number; bridge: number }> {
    return { average: 15, bridge: 25 };
  }

  private async fetchBTCPrice(): Promise<number> {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      return response.data.bitcoin.usd;
    } catch {
      return 45000; // Fallback
    }
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private getDefaultMarketConditions(): MarketConditions {
    return {
      volatilityIndex: 50,
      trendDirection: 'neutral',
      gasPrice: 20,
      bridgeCosts: 30,
      topPerformingSectors: ['Lending'],
      marketFear: 50,
      totalTVL: 150000000000
    };
  }
}
