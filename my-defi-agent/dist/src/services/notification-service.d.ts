interface RebalanceSignal {
    type: 'REBALANCE' | 'EXIT' | 'HARVEST';
    position: any;
    reason: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestedAction: string;
}
export declare class NotificationService {
    private telegramBotToken?;
    private telegramChatId?;
    private webhookUrl?;
    constructor();
    sendCriticalAlert(position: any, alerts: string[]): Promise<void>;
    sendRebalanceAlert(signal: RebalanceSignal): Promise<void>;
    sendDailyReport(report: any): Promise<void>;
    sendExecutionUpdate(result: any): Promise<void>;
    private sendNotification;
    private sendTelegramMessage;
    private sendWebhookMessage;
    private logMessage;
}
export {};
