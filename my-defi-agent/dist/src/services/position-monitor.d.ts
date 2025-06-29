export declare class PositionMonitor {
    private positions;
    private contractExecutors;
    private notificationService;
    private isMonitoring;
    private readonly thresholds;
    constructor();
    startMonitoring(): Promise<void>;
    stopMonitoring(): Promise<void>;
    addPosition(depositId: number, strategyId: number, poolProject: string, initialValue: number, expectedAPY: number): void;
    private scheduleMonitoringTasks;
    private runQuickHealthCheck;
    private runMonitoringCycle;
    private updatePositionData;
    private analyzePerformance;
    private checkRebalanceSignals;
    private checkCriticalAlerts;
    private shouldHarvest;
    private processRebalanceSignals;
    private executeAutoRebalance;
    private updatePerformanceHistory;
    private analyzeRebalancingOpportunities;
    private generateDailyReport;
    private calculatePositionAPY;
    private determinePositionChain;
    private getPositionAsset;
    private loadPositions;
    getPositionSummary(): any;
}
