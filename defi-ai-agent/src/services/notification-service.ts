import axios from 'axios';
import { logger } from '../utils/logger.js';
import { Formatters } from '../utils/helper.js';

interface RebalanceSignal {
  type: 'REBALANCE' | 'EXIT' | 'HARVEST';
  position: any;
  reason: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export class NotificationService {
  private telegramBotToken?: string;
  private telegramChatId?: string;
  private webhookUrl?: string;

  constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    this.webhookUrl = process.env.WEBHOOK_URL;
  }

  async sendCriticalAlert(position: any, alerts: string[]): Promise<void> {
    const message = `🚨 CRITICAL ALERT - ${position.poolProject}\n\n` +
      `Position ID: ${position.depositId}\n` +
      `Value: ${Formatters.formatUSD(position.currentValue || position.initialValue)}\n\n` +
      `Alerts:\n${alerts.map(alert => `• ${alert}`).join('\n')}\n\n` +
      `Time: ${new Date().toISOString()}`;

    await this.sendNotification(message, 'HIGH');
  }

  async sendRebalanceAlert(signal: RebalanceSignal): Promise<void> {
    const urgencyEmoji = {
      LOW: '🟡',
      MEDIUM: '🟠',
      HIGH: '🔴'
    };

    const message = `${urgencyEmoji[signal.urgency]} REBALANCE SIGNAL\n\n` +
      `Type: ${signal.type}\n` +
      `Pool: ${signal.position.poolProject}\n` +
      `Position: ${signal.position.depositId}\n` +
      `Value: ${Formatters.formatUSD(signal.position.currentValue || signal.position.initialValue)}\n\n` +
      `Reason: ${signal.reason}\n` +
      `Action: ${signal.suggestedAction}\n\n` +
      `Urgency: ${signal.urgency}`;

    await this.sendNotification(message, signal.urgency);
  }

  async sendDailyReport(report: any): Promise<void> {
    const pnlEmoji = report.totalPnL >= 0 ? '📈' : '📉';
    const pnlPercent = ((report.totalPnL / (report.totalValue - report.totalPnL)) * 100).toFixed(2);

    let message = `📊 DAILY PORTFOLIO REPORT - ${report.date}\n\n`;
    message += `💰 Total Value: ${Formatters.formatUSD(report.totalValue)}\n`;
    message += `${pnlEmoji} P&L: ${Formatters.formatUSD(report.totalPnL)} (${pnlPercent}%)\n`;
    message += `📊 Average APY: ${report.averageAPY.toFixed(2)}%\n`;
    message += `🎯 Active Positions: ${report.totalPositions}\n\n`;

    if (report.topPerformer) {
      message += `🏆 Top Performer: ${report.topPerformer.poolProject}\n`;
    }
    if (report.worstPerformer) {
      message += `⚠️ Needs Attention: ${report.worstPerformer.poolProject}\n`;
    }

    message += `\n📱 Full dashboard: [View Details](https://your-dashboard.com)`;

    await this.sendNotification(message, 'LOW');
  }

  async sendExecutionUpdate(result: any): Promise<void> {
    const emoji = result.success ? '✅' : '❌';
    const status = result.success ? 'SUCCESS' : 'FAILED';

    let message = `${emoji} INVESTMENT ${status}\n\n`;
    message += `Pool: ${result.poolProject}\n`;
    message += `Amount: ${Formatters.formatUSD(result.allocation * 1000)}\n`; // Approximate

    if (result.success) {
      message += `Transaction: ${result.transactionHash}\n`;
      message += `Expected APY: ${result.expectedAPY.toFixed(2)}%\n`;
      message += `Gas Cost: ${result.totalCost} ETH`;
    } else {
      message += `Error: ${result.error}`;
    }

    await this.sendNotification(message, result.success ? 'LOW' : 'MEDIUM');
  }

  private async sendNotification(message: string, priority: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<void> {
    const promises: Promise<void>[] = [];

    // Send to Telegram if configured
    if (this.telegramBotToken && this.telegramChatId) {
      promises.push(this.sendTelegramMessage(message, priority));
    }

    // Send to webhook if configured
    if (this.webhookUrl) {
      promises.push(this.sendWebhookMessage(message, priority));
    }

    // Always log the message
    promises.push(this.logMessage(message, priority));

    try {
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error('❌ Failed to send some notifications:', error);
    }
  }

  private async sendTelegramMessage(message: string, priority: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;

      await axios.post(url, {
        chat_id: this.telegramChatId,
        text: message,
        parse_mode: 'HTML',
        disable_notification: priority === 'LOW'
      }, {
        timeout: 10000
      });

      logger.debug('📱 Telegram notification sent');
    } catch (error) {
      logger.error('❌ Failed to send Telegram notification:', error);
    }
  }

  private async sendWebhookMessage(message: string, priority: string): Promise<void> {
    try {
      await axios.post(this.webhookUrl!, {
        text: message,
        priority,
        timestamp: new Date().toISOString(),
        source: 'defi-ai-agent'
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.debug('🌐 Webhook notification sent');
    } catch (error) {
      logger.error('❌ Failed to send webhook notification:', error);
    }
  }

  private async logMessage(message: string, priority: string): Promise<void> {
    const logLevel = priority === 'HIGH' ? 'error' : priority === 'MEDIUM' ? 'warn' : 'info';
    logger[logLevel](`📢 Notification [${priority}]: ${message.replace(/\n/g, ' | ')}`);
  }
}
