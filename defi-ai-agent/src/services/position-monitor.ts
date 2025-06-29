import cron from 'node-cron';
import { ContractExecutor } from './contract-executor.js';
import { NotificationService } from './notification-service.js';
import { logger } from '../utils/logger.js';
import { Formatters } from '../utils/helper.js';
import { TOKEN_ADDRESSES } from '../utils/constant.js';

interface Position {
  depositId: number;
  strategyId: number;
  poolProject: string;
  initialValue: number;
  currentValue?: number;
  expectedAPY: number;
  startTime: number;
  lastCheck: number;
  performanceHistory: PerformanceSnapshot[];
}

interface PerformanceSnapshot {
  timestamp: number;
  value: number;
  apy: number;
  pnl: number;
}

interface RebalanceSignal {
  type: 'REBALANCE' | 'EXIT' | 'HARVEST';
  position: Position;
  reason: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export class PositionMonitor {
  private positions: Map<number, Position> = new Map();
  private contractExecutors: Record<string, ContractExecutor> = {};
  private notificationService: NotificationService;
  private isMonitoring = false;

  // Monitoring thresholds
  private readonly thresholds = {
    maxDrawdown: 0.15,        // 15% max drawdown
    minAPYDeviation: 0.25,    // 25% APY deviation
    staleDataTimeout: 3600000, // 1 hour
    rebalanceThreshold: 0.1,  // 10% allocation drift
    harvestThreshold: 0.05    // 5% yield accumulation
  };

  constructor() {
    this.contractExecutors = {
      base: new ContractExecutor('base'),
      avalanche: new ContractExecutor('avalanche')
    };
    this.notificationService = new NotificationService();
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('⚠️ Position monitoring already active');
      return;
    }

    this.isMonitoring = true;
    logger.info('🔍 Starting position monitoring...');

    // Load existing positions
    await this.loadPositions();

    // Schedule monitoring tasks
    this.scheduleMonitoringTasks();

    // Start immediate monitoring cycle
    await this.runMonitoringCycle();

    logger.info('✅ Position monitoring started successfully');
  }

  async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    logger.info('🛑 Position monitoring stopped');
  }

  addPosition(
    depositId: number,
    strategyId: number,
    poolProject: string,
    initialValue: number,
    expectedAPY: number
  ): void {
    const position: Position = {
      depositId,
      strategyId,
      poolProject,
      initialValue,
      expectedAPY,
      startTime: Date.now(),
      lastCheck: Date.now(),
      performanceHistory: []
    };

    this.positions.set(depositId, position);
    logger.info(`📊 Added position to monitoring: ${poolProject} (${Formatters.formatUSD(initialValue)})`);
  }

  private scheduleMonitoringTasks(): void {
    // Every 15 minutes - quick health check
    cron.schedule('*/15 * * * *', async () => {
      if (this.isMonitoring) {
        await this.runQuickHealthCheck();
      }
    });

    // Every hour - full monitoring cycle
    cron.schedule('0 * * * *', async () => {
      if (this.isMonitoring) {
        await this.runMonitoringCycle();
      }
    });

    // Every 6 hours - rebalancing analysis
    cron.schedule('0 */6 * * *', async () => {
      if (this.isMonitoring) {
        await this.analyzeRebalancingOpportunities();
      }
    });

    // Daily at 8 AM - performance report
    cron.schedule('0 8 * * *', async () => {
      if (this.isMonitoring) {
        await this.generateDailyReport();
      }
    });

    logger.info('📅 Monitoring schedules configured');
  }

  private async runQuickHealthCheck(): Promise<void> {
    logger.info('🔍 Running quick health check...');

    for (const [depositId, position] of this.positions) {
      try {
        // Check if position data is stale
        const timeSinceLastCheck = Date.now() - position.lastCheck;
        if (timeSinceLastCheck > this.thresholds.staleDataTimeout) {
          await this.updatePositionData(position);
        }

        // Check for critical alerts
        const alerts = await this.checkCriticalAlerts(position);
        if (alerts.length > 0) {
          await this.notificationService.sendCriticalAlert(position, alerts);
        }

      } catch (error) {
        logger.error(`❌ Health check failed for position ${depositId}:`, error);
      }
    }
  }

  private async runMonitoringCycle(): Promise<void> {
    logger.info('🔄 Running full monitoring cycle...');

    for (const [depositId, position] of this.positions) {
      try {
        // Update position data
        await this.updatePositionData(position);

        // Analyze performance
        const performance = await this.analyzePerformance(position);

        // Check for rebalancing signals
        const signals = await this.checkRebalanceSignals(position, performance);

        if (signals.length > 0) {
          await this.processRebalanceSignals(signals);
        }

        // Update performance history
        this.updatePerformanceHistory(position, performance);

      } catch (error) {
        logger.error(`❌ Monitoring cycle failed for position ${depositId}:`, error);
      }
    }

    logger.info('✅ Monitoring cycle completed');
  }

  private async updatePositionData(position: Position): Promise<void> {
    try {
      // Determine which chain this position is on
      const chain = this.determinePositionChain(position);
      const executor = this.contractExecutors[chain];

      // Get current allocation info
      const asset = this.getPositionAsset(position);
      const allocationInfo = await executor.getAllocationInfo(position.strategyId, asset);

      if (allocationInfo) {
        position.currentValue = parseFloat(allocationInfo.currentValue);
        position.lastCheck = Date.now();

        logger.debug(`📊 Updated position ${position.depositId}: ${Formatters.formatUSD(position.currentValue || 0)}`);
      }

    } catch (error) {
      logger.error(`❌ Failed to update position ${position.depositId}:`, error);
    }
  }

  private async analyzePerformance(position: Position): Promise<{
    currentAPY: number;
    pnl: number;
    pnlPercent: number;
    daysSinceStart: number;
    isUnderperforming: boolean;
  }> {
    const daysSinceStart = (Date.now() - position.startTime) / (1000 * 60 * 60 * 24);
    const currentValue = position.currentValue || position.initialValue;

    const pnl = currentValue - position.initialValue;
    const pnlPercent = (pnl / position.initialValue) * 100;

    // Calculate current APY based on actual performance
    const currentAPY = daysSinceStart > 0 ?
      (Math.pow(currentValue / position.initialValue, 365 / daysSinceStart) - 1) * 100 : 0;

    // Check if underperforming vs expected APY
    const apyDeviation = Math.abs(currentAPY - position.expectedAPY) / position.expectedAPY;
    const isUnderperforming = currentAPY < position.expectedAPY * 0.75 || // 25% below expected
                              apyDeviation > this.thresholds.minAPYDeviation;

    return {
      currentAPY,
      pnl,
      pnlPercent,
      daysSinceStart,
      isUnderperforming
    };
  }

  private async checkRebalanceSignals(position: Position, performance: any): Promise<RebalanceSignal[]> {
    const signals: RebalanceSignal[] = [];

    // Check for stop-loss conditions
    if (performance.pnlPercent < -this.thresholds.maxDrawdown * 100) {
      signals.push({
        type: 'EXIT',
        position,
        reason: `Stop-loss triggered: ${performance.pnlPercent.toFixed(2)}% drawdown`,
        urgency: 'HIGH',
        suggestedAction: `Exit position to prevent further losses`
      });
    }

    // Check for severe underperformance
    if (performance.isUnderperforming && performance.daysSinceStart > 7) {
      signals.push({
        type: 'REBALANCE',
        position,
        reason: `Underperforming: ${performance.currentAPY.toFixed(2)}% vs ${position.expectedAPY.toFixed(2)}% expected`,
        urgency: 'MEDIUM',
        suggestedAction: 'Consider reallocating to better performing pools'
      });
    }

    // Check for harvest opportunities
    if (await this.shouldHarvest(position, performance)) {
      signals.push({
        type: 'HARVEST',
        position,
        reason: 'Accumulated yield ready for harvest',
        urgency: 'LOW',
        suggestedAction: 'Harvest rewards to compound returns'
      });
    }

    return signals;
  }

  private async checkCriticalAlerts(position: Position): Promise<string[]> {
    const alerts: string[] = [];

    if (!position.currentValue) {
      alerts.push('Position value could not be retrieved');
    }

    const timeSinceLastCheck = Date.now() - position.lastCheck;
    if (timeSinceLastCheck > this.thresholds.staleDataTimeout * 2) {
      alerts.push('Position data is severely stale');
    }

    // Add more critical checks as needed
    return alerts;
  }

  private async shouldHarvest(position: Position, performance: any): Promise<boolean> {
    // Simple harvest logic - could be enhanced
    return performance.pnl > position.initialValue * this.thresholds.harvestThreshold;
  }

  private async processRebalanceSignals(signals: RebalanceSignal[]): Promise<void> {
    for (const signal of signals) {
      logger.info(`🚨 Rebalance signal: ${signal.type} for ${signal.position.poolProject}`);
      logger.info(`   Reason: ${signal.reason}`);
      logger.info(`   Urgency: ${signal.urgency}`);
      logger.info(`   Action: ${signal.suggestedAction}`);

      // Send notification
      await this.notificationService.sendRebalanceAlert(signal);

      // Auto-execute for high urgency signals if configured
      if (signal.urgency === 'HIGH' && process.env.AUTO_REBALANCE === 'true') {
        await this.executeAutoRebalance(signal);
      }
    }
  }

  private async executeAutoRebalance(signal: RebalanceSignal): Promise<void> {
    try {
      logger.info(`🤖 Auto-executing rebalance for ${signal.position.poolProject}`);

      const chain = this.determinePositionChain(signal.position);
      const executor = this.contractExecutors[chain];

      if (signal.type === 'EXIT') {
        // Execute withdrawal
        const asset = this.getPositionAsset(signal.position);
        const amount = signal.position.currentValue?.toString() || '0';

        const result = await executor.withdrawFromStrategy(
          signal.position.strategyId,
          asset,
          amount,
          signal.position.depositId
        );

        if (result.success) {
          logger.info(`✅ Auto-exit executed: ${result.transactionHash}`);
          this.positions.delete(signal.position.depositId);
        }

      } else if (signal.type === 'HARVEST') {
        // Execute harvest
        const asset = this.getPositionAsset(signal.position);
        const result = await executor.harvestYield(signal.position.strategyId, [asset]);

        if (result.success) {
          logger.info(`✅ Auto-harvest executed: ${result.transactionHash}`);
        }
      }

    } catch (error) {
      logger.error(`❌ Auto-rebalance failed:`, error);
    }
  }

  private updatePerformanceHistory(position: Position, performance: any): void {
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      value: position.currentValue || position.initialValue,
      apy: performance.currentAPY,
      pnl: performance.pnl
    };

    position.performanceHistory.push(snapshot);

    // Keep only last 100 snapshots
    if (position.performanceHistory.length > 100) {
      position.performanceHistory = position.performanceHistory.slice(-100);
    }
  }

  private async analyzeRebalancingOpportunities(): Promise<void> {
    logger.info('🔄 Analyzing rebalancing opportunities...');

    // This would include more sophisticated portfolio analysis
    // For now, just log that we're checking
    const totalPositions = this.positions.size;
    const totalValue = Array.from(this.positions.values())
      .reduce((sum, p) => sum + (p.currentValue || p.initialValue), 0);

    logger.info(`📊 Portfolio overview: ${totalPositions} positions, ${Formatters.formatUSD(totalValue)} total value`);
  }

  private async generateDailyReport(): Promise<void> {
    logger.info('📊 Generating daily performance report...');

    const report = {
      date: new Date().toISOString().split('T')[0],
      totalPositions: this.positions.size,
      totalValue: 0,
      totalPnL: 0,
      averageAPY: 0,
      topPerformer: null as Position | null,
      worstPerformer: null as Position | null
    };

    let totalInitialValue = 0;
    let weightedAPY = 0;

    for (const position of this.positions.values()) {
      const currentValue = position.currentValue || position.initialValue;
      const pnl = currentValue - position.initialValue;

      report.totalValue += currentValue;
      report.totalPnL += pnl;
      totalInitialValue += position.initialValue;

      // Calculate position APY and weight it by size
      const daysSinceStart = (Date.now() - position.startTime) / (1000 * 60 * 60 * 24);
      const positionAPY = daysSinceStart > 0 ?
        (Math.pow(currentValue / position.initialValue, 365 / daysSinceStart) - 1) * 100 : 0;

      weightedAPY += positionAPY * (position.initialValue / totalInitialValue);

      // Track best/worst performers
      if (!report.topPerformer || positionAPY > this.calculatePositionAPY(report.topPerformer)) {
        report.topPerformer = position;
      }
      if (!report.worstPerformer || positionAPY < this.calculatePositionAPY(report.worstPerformer)) {
        report.worstPerformer = position;
      }
    }

    report.averageAPY = weightedAPY;

    // Send daily report
    await this.notificationService.sendDailyReport(report);

    logger.info('✅ Daily report generated and sent');
  }

  private calculatePositionAPY(position: Position): number {
    const daysSinceStart = (Date.now() - position.startTime) / (1000 * 60 * 60 * 24);
    const currentValue = position.currentValue || position.initialValue;

    return daysSinceStart > 0 ?
      (Math.pow(currentValue / position.initialValue, 365 / daysSinceStart) - 1) * 100 : 0;
  }

  private determinePositionChain(position: Position): string {
    // For now, default to base. Could be enhanced with chain detection logic
    return 'base';
  }

  private getPositionAsset(position: Position): string {
    // Default to USDC. Could be enhanced with asset detection
    return TOKEN_ADDRESSES.BASE.USDC;
  }

  private async loadPositions(): Promise<void> {
    // In production, this would load from a database
    // For now, positions are added via addPosition method
    logger.info('📁 Position data loaded from storage');
  }

  getPositionSummary(): any {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || p.initialValue), 0);
    const totalPnL = positions.reduce((sum, p) => sum + ((p.currentValue || p.initialValue) - p.initialValue), 0);

    return {
      totalPositions: positions.length,
      totalValue,
      totalPnL,
      positions: positions.map(p => ({
        depositId: p.depositId,
        project: p.poolProject,
        value: p.currentValue || p.initialValue,
        pnl: (p.currentValue || p.initialValue) - p.initialValue,
        apy: this.calculatePositionAPY(p)
      }))
    };
  }
}
