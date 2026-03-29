import type { Redis } from 'ioredis';
import { PrismaClient, Prisma, AlertType, AlertChannel, AlertDeliveryStatus } from '@prisma/client';
import { createLogger } from '@flashroute/shared';

const logger = createLogger('jobs-worker:alerts');

const ALERT_DEDUP_TTL_SECONDS = 86400;

type AlertRuleWithUser = Prisma.AlertRuleGetPayload<{
  include: { user: { select: { email: true } } };
}>;

interface AlertEvent {
  eventType: string;
  tradeId?: string;
  userId: string;
  chainId?: number;
  profitUsd?: number;
  gasPriceGwei?: number;
  errorMessage?: string;
}

export class EvaluateAlertsRepository {
  constructor(
    private readonly redis: Redis,
    private readonly prisma: PrismaClient
  ) {}

  private getDeduplicationKey(alertId: string, eventRefId: string, channel: AlertChannel): string {
    return `fr:alert:delivered:${alertId}:${eventRefId}:${channel}`;
  }

  private async isAlertDuplicate(
    alertId: string,
    eventRefId: string,
    channel: AlertChannel
  ): Promise<boolean> {
    const key = this.getDeduplicationKey(alertId, eventRefId, channel);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  private async markAlertDelivered(
    alertId: string,
    eventRefId: string,
    channel: AlertChannel
  ): Promise<void> {
    const key = this.getDeduplicationKey(alertId, eventRefId, channel);
    await this.redis.setex(key, ALERT_DEDUP_TTL_SECONDS, '1');
  }

  async evaluatePendingAlerts(): Promise<number> {
    const eventKeys = await this.redis.keys('fr:alerts:pending:*');
    
    if (eventKeys.length === 0) {
      logger.debug('No pending alert events found');
      return 0;
    }

    let processedCount = 0;

    for (const key of eventKeys) {
      try {
        const eventData = await this.redis.get(key);
        if (!eventData) {
          await this.redis.del(key);
          continue;
        }

        const event: AlertEvent = JSON.parse(eventData);
        const eventRefId = key.split(':').pop()!;

        const alertRules = await this.prisma.alertRule.findMany({
          where: {
            userId: event.userId,
            isActive: true,
            type: this.mapEventToAlertType(event.eventType),
          },
          include: {
            user: {
              select: { email: true },
            },
          },
        });

        for (const rule of alertRules) {
          if (!this.checkThreshold(rule, event)) {
            continue;
          }

          if (rule.lastTriggeredAt && rule.cooldownSeconds > 0) {
            const cooldownMs = rule.cooldownSeconds * 1000;
            const timeSinceLastTrigger = Date.now() - rule.lastTriggeredAt.getTime();
            if (timeSinceLastTrigger < cooldownMs) {
              logger.debug(
                { ruleId: rule.id, cooldownRemaining: cooldownMs - timeSinceLastTrigger },
                'Alert rule in cooldown'
              );
              continue;
            }
          }

          const isDuplicate = await this.isAlertDuplicate(rule.id, eventRefId, rule.deliveryChannel);
          if (isDuplicate) {
            logger.debug(
              { ruleId: rule.id, eventRefId, channel: rule.deliveryChannel },
              'Alert already delivered for this event (deduplicated)'
            );
            continue;
          }

          await this.deliverAlert(rule, event, eventRefId);
        }

        await this.redis.del(key);
        processedCount++;
      } catch (err) {
        logger.error(
          { key, error: err instanceof Error ? err.message : 'Unknown' },
          'Failed to process alert event'
        );
      }
    }

    logger.info({ processedCount }, 'Completed alert evaluation');
    return processedCount;
  }

  private async deliverAlert(
    rule: AlertRuleWithUser,
    event: AlertEvent,
    eventRefId: string
  ): Promise<void> {
    const history = await this.prisma.alertHistory.create({
      data: {
        alertId: rule.id,
        userId: rule.userId,
        tradeId: event.tradeId,
        message: this.buildAlertMessage(rule.type, event),
        deliveryStatus: AlertDeliveryStatus.PENDING,
      },
    });

    try {
      switch (rule.deliveryChannel) {
        case AlertChannel.DASHBOARD:
          await this.deliverToDashboard(rule, event, history.id);
          break;
        case AlertChannel.EMAIL:
          await this.deliverToEmail(rule, event, history.id);
          break;
        case AlertChannel.TELEGRAM:
          await this.deliverToTelegram(rule, event, history.id);
          break;
        case AlertChannel.WEBHOOK:
          await this.deliverToWebhook(rule, event, history.id);
          break;
      }

      await this.markAlertDelivered(rule.id, eventRefId, rule.deliveryChannel);

      await this.prisma.alertHistory.update({
        where: { id: history.id },
        data: {
          deliveryStatus: AlertDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });

      await this.prisma.alertRule.update({
        where: { id: rule.id },
        data: {
          lastTriggeredAt: new Date(),
          triggerCount: { increment: 1 },
        },
      });

      logger.debug(
        { ruleId: rule.id, historyId: history.id },
        'Alert delivered successfully'
      );
    } catch (err) {
      await this.prisma.alertHistory.update({
        where: { id: history.id },
        data: {
          deliveryStatus: AlertDeliveryStatus.FAILED,
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        },
      });

      logger.error(
        { ruleId: rule.id, historyId: history.id, error: err instanceof Error ? err.message : 'Unknown' },
        'Alert delivery failed'
      );
    }
  }

  private async deliverToDashboard(
    rule: AlertRuleWithUser,
    event: AlertEvent,
    historyId: string
  ): Promise<void> {
    const channel = `fr:user:${rule.userId}:alerts`;
    await this.redis.publish(channel, JSON.stringify({
      historyId,
      type: rule.type,
      message: this.buildAlertMessage(rule.type, event),
      timestamp: new Date().toISOString(),
    }));
  }

  private async deliverToEmail(
    rule: AlertRuleWithUser,
    event: AlertEvent,
    historyId: string
  ): Promise<void> {
    await this.redis.lpush('fr:email:queue', JSON.stringify({
      to: rule.user.email,
      subject: `FlashRoute Alert: ${rule.type}`,
      body: this.buildAlertMessage(rule.type, event),
      historyId,
    }));
    logger.debug({ ruleId: rule.id, email: rule.user.email }, 'Queued email alert');
  }

  private async deliverToTelegram(
    rule: AlertRuleWithUser,
    event: AlertEvent,
    historyId: string
  ): Promise<void> {
    const config = rule.deliveryConfig as { telegramChatId?: string; telegramBotToken?: string };
    if (!config.telegramChatId || !config.telegramBotToken) {
      throw new Error('Telegram configuration missing');
    }

    await this.redis.lpush('fr:telegram:queue', JSON.stringify({
      botToken: config.telegramBotToken,
      chatId: config.telegramChatId,
      text: this.buildAlertMessage(rule.type, event),
      historyId,
    }));
    logger.debug({ ruleId: rule.id, chatId: config.telegramChatId }, 'Queued Telegram alert');
  }

  private async deliverToWebhook(
    rule: AlertRuleWithUser,
    event: AlertEvent,
    historyId: string
  ): Promise<void> {
    const config = rule.deliveryConfig as { webhookUrl?: string; webhookSecret?: string };
    if (!config.webhookUrl) {
      throw new Error('Webhook URL missing');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.webhookSecret ? { 'X-Webhook-Secret': config.webhookSecret } : {}),
        },
        body: JSON.stringify({
          historyId,
          type: rule.type,
          message: this.buildAlertMessage(rule.type, event),
          event,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  private mapEventToAlertType(eventType: string): AlertType | undefined {
    const mapping: Record<string, AlertType> = {
      'execution.success': AlertType.TRADE_EXECUTED,
      'execution.failed': AlertType.TRADE_FAILED,
      'execution.reverted': AlertType.TRADE_FAILED,
      'opportunity.detected': AlertType.OPPORTUNITY_FOUND,
      'gas.spike': AlertType.GAS_SPIKE,
      'system.error': AlertType.SYSTEM_ERROR,
    };
    return mapping[eventType];
  }

  private checkThreshold(rule: AlertRuleWithUser, event: AlertEvent): boolean {
    if (rule.type === AlertType.GAS_SPIKE && event.gasPriceGwei) {
      const threshold = rule.thresholdValue ? Number(rule.thresholdValue) : 100;
      return event.gasPriceGwei >= threshold;
    }

    if (rule.type === AlertType.PROFIT_THRESHOLD && event.profitUsd) {
      const threshold = rule.thresholdValue ? Number(rule.thresholdValue) : 0;
      return event.profitUsd >= threshold;
    }

    if (rule.type === AlertType.TRADE_EXECUTED || rule.type === AlertType.TRADE_FAILED) {
      return true;
    }

    if (rule.type === AlertType.OPPORTUNITY_FOUND) {
      return true;
    }

    return false;
  }

  private buildAlertMessage(type: AlertType, event: AlertEvent): string {
    switch (type) {
      case AlertType.TRADE_EXECUTED:
        return `Trade executed successfully${event.chainId ? ` on chain ${event.chainId}` : ''}. Profit: $${event.profitUsd?.toFixed(2) ?? 'N/A'}`;
      case AlertType.TRADE_FAILED:
        return `Trade failed${event.chainId ? ` on chain ${event.chainId}` : ''}.${event.errorMessage ? ` Error: ${event.errorMessage}` : ''}`;
      case AlertType.OPPORTUNITY_FOUND:
        return `New arbitrage opportunity detected${event.chainId ? ` on chain ${event.chainId}` : ''}.`;
      case AlertType.GAS_SPIKE:
        return `Gas spike detected: ${event.gasPriceGwei?.toFixed(2) ?? 'N/A'} Gwei`;
      case AlertType.PROFIT_THRESHOLD:
        return `Profit threshold exceeded: $${event.profitUsd?.toFixed(2) ?? 'N/A'}`;
      case AlertType.SYSTEM_ERROR:
        return `System error occurred: ${event.errorMessage ?? 'Unknown error'}`;
      default:
        return `Alert triggered: ${type}`;
    }
  }
}
