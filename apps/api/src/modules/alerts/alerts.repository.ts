import type { PrismaClientLike } from '../auth/auth.repository';

export interface AlertRuleRecord {
  id: string;
  userId: string;
  type: string;
  chainId: number | null;
  strategyId: string | null;
  thresholdValue: number | null;
  deliveryChannel: string;
  deliveryConfig: Record<string, unknown>;
  isActive: boolean;
  lastTriggeredAt: Date | null;
  triggerCount: number;
  cooldownSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertHistoryRecord {
  id: string;
  alertId: string;
  userId: string;
  tradeId: string | null;
  message: string;
  deliveryStatus: string;
  deliveredAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface AlertsRepository {
  create(input: Omit<AlertRuleRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt' | 'triggerCount'>): Promise<AlertRuleRecord>;
  findById(userId: string, alertId: string): Promise<AlertRuleRecord | null>;
  findByIdAndUserId(userId: string, alertId: string): Promise<AlertRuleRecord | null>;
  listByUser(userId: string, filters: { type?: string; isActive?: boolean; page: number; limit: number }): Promise<{ alerts: AlertRuleRecord[]; total: number }>;
  update(alertId: string, userId: string, updates: Partial<AlertRuleRecord>): Promise<AlertRuleRecord>;
  countByUser(userId: string): Promise<number>;
  createHistory(input: Omit<AlertHistoryRecord, 'id' | 'createdAt'>): Promise<AlertHistoryRecord>;
  listHistoryByAlert(alertId: string, userId: string, filters: { page: number; limit: number }): Promise<{ history: AlertHistoryRecord[]; total: number }>;
}

const toAlertRuleRecord = (record: any): AlertRuleRecord => ({
  id: record.id,
  userId: record.userId,
  type: record.type,
  chainId: record.chainId ?? null,
  strategyId: record.strategyId ?? null,
  thresholdValue: record.thresholdValue ? Number(record.thresholdValue) : null,
  deliveryChannel: record.deliveryChannel,
  deliveryConfig: record.deliveryConfig ?? {},
  isActive: record.isActive,
  lastTriggeredAt: record.lastTriggeredAt ?? null,
  triggerCount: record.triggerCount ?? 0,
  cooldownSeconds: record.cooldownSeconds ?? 60,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const toAlertHistoryRecord = (record: any): AlertHistoryRecord => ({
  id: record.id,
  alertId: record.alertId,
  userId: record.userId,
  tradeId: record.tradeId ?? null,
  message: record.message,
  deliveryStatus: record.deliveryStatus,
  deliveredAt: record.deliveredAt ?? null,
  errorMessage: record.errorMessage ?? null,
  createdAt: record.createdAt,
});

export class PrismaAlertsRepository implements AlertsRepository {
  public constructor(private readonly prisma: PrismaClientLike) {}

  public async create(input: Omit<AlertRuleRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt' | 'triggerCount'>) {
    const record = await (this.prisma as any).alertRule.create({ data: input });
    return toAlertRuleRecord(record);
  }

  public async findById(userId: string, alertId: string) {
    const record = await (this.prisma as any).alertRule.findFirst({ where: { id: alertId, userId } });
    return record ? toAlertRuleRecord(record) : null;
  }

  public async findByIdAndUserId(userId: string, alertId: string) {
    return this.findById(userId, alertId);
  }

  public async listByUser(userId: string, filters: { type?: string; isActive?: boolean; page: number; limit: number }) {
    const where: any = { userId };
    if (filters.type !== undefined) {
      where.type = filters.type;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [records, total] = await Promise.all([
      (this.prisma as any).alertRule.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).alertRule.count({ where }),
    ]);

    return { alerts: records.map(toAlertRuleRecord), total };
  }

  public async update(alertId: string, userId: string, updates: Partial<AlertRuleRecord>) {
    const record = await (this.prisma as any).alertRule.update({
      where: { id: alertId },
      data: {
        ...updates,
        updatedAt: undefined,
      },
    });
    return toAlertRuleRecord(record);
  }

  public async countByUser(userId: string) {
    return (this.prisma as any).alertRule.count({ where: { userId, isActive: true } });
  }

  public async createHistory(input: Omit<AlertHistoryRecord, 'id' | 'createdAt'>) {
    const record = await (this.prisma as any).alertHistory.create({ data: input });
    return toAlertHistoryRecord(record);
  }

  public async listHistoryByAlert(alertId: string, userId: string, filters: { page: number; limit: number }) {
    const where = { alertId, userId };
    const [records, total] = await Promise.all([
      (this.prisma as any).alertHistory.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).alertHistory.count({ where }),
    ]);
    return { history: records.map(toAlertHistoryRecord), total };
  }
}
