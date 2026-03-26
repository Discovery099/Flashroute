import { ApiError } from '../../app';
import type { AuthRepository } from '../auth/auth.repository';
import type { RequestContext } from '../auth/auth.service';
import type { AlertsRepository, AlertRuleRecord } from './alerts.repository';
import type { CreateAlertInput, UpdateAlertInput, ListAlertsQuery, AlertHistoryQuery, AlertChannel } from './alerts.schemas';

const maxAlertsByRole: Record<string, number> = {
  monitor: 5,
  trader: 20,
  executor: 100,
  institutional: Number.POSITIVE_INFINITY,
  admin: Number.POSITIVE_INFINITY,
};

export class AlertsService {
  public constructor(
    private readonly authRepository: AuthRepository,
    private readonly alertsRepository: AlertsRepository,
  ) {}

  public async list(userId: string, query: ListAlertsQuery) {
    await this.requireUser(userId);
    const result = await this.alertsRepository.listByUser(userId, {
      type: query.type,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    return {
      alerts: result.alerts.map((alert) => this.toDto(alert)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }

  public async create(userId: string, input: CreateAlertInput, context?: RequestContext) {
    const user = await this.requireUser(userId);
    const existingCount = await this.alertsRepository.countByUser(userId);
    const maxAlerts = maxAlertsByRole[user.role] ?? 0;
    if (existingCount >= maxAlerts) {
      throw new ApiError(403, 'TIER_LIMIT', `Alert limit reached for ${user.role} tier. Maximum: ${maxAlerts}`);
    }

    const alert = await this.alertsRepository.create({
      userId,
      type: input.type,
      chainId: input.chainId ?? null,
      strategyId: input.strategyId ?? null,
      thresholdValue: input.thresholdValue ?? null,
      deliveryChannel: input.deliveryChannel,
      deliveryConfig: input.deliveryConfig,
      isActive: true,
      cooldownSeconds: input.cooldownSeconds,
    });

    await this.audit(userId, 'alert.create', alert.id, { type: input.type }, context);
    return this.toDto(alert);
  }

  public async get(userId: string, alertId: string) {
    await this.requireUser(userId);
    const alert = await this.requireOwnedAlert(userId, alertId);
    return this.toDto(alert);
  }

  public async update(userId: string, alertId: string, input: UpdateAlertInput, context?: RequestContext) {
    await this.requireUser(userId);
    await this.requireOwnedAlert(userId, alertId);

    const updateData: Partial<AlertRuleRecord> = {};
    if (input.type !== undefined) updateData.type = input.type;
    if (input.chainId !== undefined) updateData.chainId = input.chainId;
    if (input.strategyId !== undefined) updateData.strategyId = input.strategyId;
    if (input.thresholdValue !== undefined) updateData.thresholdValue = input.thresholdValue;
    if (input.deliveryChannel !== undefined) updateData.deliveryChannel = input.deliveryChannel;
    if (input.deliveryConfig !== undefined) updateData.deliveryConfig = input.deliveryConfig;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.cooldownSeconds !== undefined) updateData.cooldownSeconds = input.cooldownSeconds;

    const updated = await this.alertsRepository.update(alertId, userId, updateData);
    await this.audit(userId, 'alert.update', alertId, { fields: Object.keys(input) }, context);
    return this.toDto(updated);
  }

  public async delete(userId: string, alertId: string, context?: RequestContext) {
    await this.requireUser(userId);
    await this.requireOwnedAlert(userId, alertId);
    await this.alertsRepository.update(alertId, userId, { isActive: false });
    await this.audit(userId, 'alert.delete', alertId, {}, context);
  }

  public async getHistory(userId: string, alertId: string, query: AlertHistoryQuery) {
    await this.requireUser(userId);
    await this.requireOwnedAlert(userId, alertId);
    const result = await this.alertsRepository.listHistoryByAlert(alertId, userId, {
      page: query.page,
      limit: query.limit,
    });

    return {
      history: result.history.map((h) => this.toHistoryDto(h)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }

  private async requireUser(userId: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user || user.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }
    return user;
  }

  private async requireOwnedAlert(userId: string, alertId: string) {
    const alert = await this.alertsRepository.findByIdAndUserId(userId, alertId);
    if (!alert) {
      throw new ApiError(404, 'NOT_FOUND', 'Alert not found');
    }
    return alert;
  }

  private async audit(userId: string, action: string, alertId: string, details: Record<string, unknown>, context?: RequestContext) {
    await this.authRepository.createAuditLog({
      userId,
      action,
      resourceType: 'alert',
      resourceId: alertId,
      details,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });
  }

  private toDto(alert: AlertRuleRecord) {
    return {
      id: alert.id,
      type: alert.type,
      chainId: alert.chainId,
      strategyId: alert.strategyId,
      thresholdValue: alert.thresholdValue,
      deliveryChannel: alert.deliveryChannel,
      deliveryConfig: alert.deliveryConfig,
      isActive: alert.isActive,
      lastTriggeredAt: alert.lastTriggeredAt?.toISOString() ?? null,
      triggerCount: alert.triggerCount,
      cooldownSeconds: alert.cooldownSeconds,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
    };
  }

  private toHistoryDto(history: { id: string; alertId: string; userId: string; tradeId: string | null; message: string; deliveryStatus: string; deliveredAt: Date | null; errorMessage: string | null; createdAt: Date }) {
    return {
      id: history.id,
      alertId: history.alertId,
      tradeId: history.tradeId,
      message: history.message,
      deliveryStatus: history.deliveryStatus,
      deliveredAt: history.deliveredAt?.toISOString() ?? null,
      errorMessage: history.errorMessage,
      createdAt: history.createdAt.toISOString(),
    };
  }
}
