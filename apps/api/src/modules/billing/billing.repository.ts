import type { SubscriptionRecord } from '../auth/auth.repository';

export type { SubscriptionRecord };

export interface BillingRepository {
  findUserById(userId: string): Promise<{ id: string; email: string; name: string; role: string; stripeCustomerId: string | null } | null>;
  updateUserRole(userId: string, role: string): Promise<void>;
  updateUserStripeCustomerId(userId: string, customerId: string): Promise<void>;
  findSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null>;
  findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null>;
  findSubscriptionByStripeCustomerId(customerId: string): Promise<SubscriptionRecord | null>;
  upsertSubscription(data: {
    userId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    plan: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date | null;
  }): Promise<SubscriptionRecord>;
  updateSubscription(id: string, data: Partial<{
    status: string;
    plan: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    graceUntil: Date | null;
  }>): Promise<SubscriptionRecord>;
  deactivateStrategiesForUser(userId: string): Promise<number>;
  createAuditLog(data: {
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    details: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
  }): Promise<void>;
}

interface PrismaUserModel {
  findUnique(args: { where: { id: string }; select: { id: true; email: true; name: true; role: true; stripeCustomerId: true } }): Promise<{ id: string; email: string; name: string; role: string; stripeCustomerId: string | null } | null>;
  update(args: { where: { id: string }; data: { role?: unknown; stripeCustomerId?: string } }): Promise<unknown>;
}

interface PrismaSubscriptionModel {
  findUnique(args: { where: { userId?: string; stripeSubscriptionId?: string } }): Promise<unknown | null>;
  findFirst(args: { where: { user: { stripeCustomerId: string } } }): Promise<unknown | null>;
  upsert(args: { where: { userId: string }; create: unknown; update: unknown }): Promise<unknown>;
  update(args: { where: { id: string }; data: unknown }): Promise<unknown>;
}

interface PrismaStrategyModel {
  updateMany(args: { where: { userId: string; isActive: boolean }; data: { isActive: boolean } }): Promise<{ count: number }>;
}

interface PrismaAuditLogModel {
  create(args: { data: unknown }): Promise<unknown>;
}

export interface PrismaBillingClientLike {
  user: PrismaUserModel;
  subscription: PrismaSubscriptionModel;
  strategy: PrismaStrategyModel;
  auditLog: PrismaAuditLogModel;
}

const toSubscriptionRecord = (record: any): SubscriptionRecord => ({
  id: record.id,
  userId: record.userId,
  plan: record.plan,
  status: record.status,
  currentPeriodStart: record.currentPeriodStart,
  currentPeriodEnd: record.currentPeriodEnd,
  cancelAtPeriodEnd: record.cancelAtPeriodEnd,
  trialEnd: record.trialEnd ?? null,
  graceUntil: record.graceUntil ?? null,
});

export class PrismaBillingRepository implements BillingRepository {
  public constructor(private readonly prisma: PrismaBillingClientLike) {}

  public async findUserById(userId: string) {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, stripeCustomerId: true },
    });
    return record
      ? { id: record.id, email: record.email, name: record.name, role: record.role, stripeCustomerId: record.stripeCustomerId }
      : null;
  }

  public async updateUserRole(userId: string, role: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { role: role as any } });
  }

  public async updateUserStripeCustomerId(userId: string, customerId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  public async findSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const record = await this.prisma.subscription.findUnique({ where: { userId } });
    return record ? toSubscriptionRecord(record) : null;
  }

  public async findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null> {
    const record = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId } });
    return record ? toSubscriptionRecord(record) : null;
  }

  public async findSubscriptionByStripeCustomerId(customerId: string): Promise<SubscriptionRecord | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { user: { stripeCustomerId: customerId } },
    });
    return record ? toSubscriptionRecord(record) : null;
  }

  public async upsertSubscription(data: {
    userId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    plan: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date | null;
  }): Promise<SubscriptionRecord> {
    const record = await this.prisma.subscription.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        plan: data.plan as any,
        status: data.status as any,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        trialEnd: data.trialEnd,
      },
      update: {
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripePriceId: data.stripePriceId,
        plan: data.plan as any,
        status: data.status as any,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        trialEnd: data.trialEnd,
      },
    });
    return toSubscriptionRecord(record);
  }

  public async updateSubscription(id: string, data: Partial<{
    status: string;
    plan: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    graceUntil: Date | null;
  }>): Promise<SubscriptionRecord> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.plan !== undefined) updateData.plan = data.plan;
    if (data.currentPeriodStart !== undefined) updateData.currentPeriodStart = data.currentPeriodStart;
    if (data.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = data.currentPeriodEnd;
    if (data.cancelAtPeriodEnd !== undefined) updateData.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    if (data.graceUntil !== undefined) updateData.graceUntil = data.graceUntil;

    const record = await this.prisma.subscription.update({
      where: { id },
      data: updateData,
    });
    return toSubscriptionRecord(record);
  }

  public async deactivateStrategiesForUser(userId: string): Promise<number> {
    const result = await this.prisma.strategy.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return result.count;
  }

  public async createAuditLog(data: {
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    details: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        details: data.details,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestId: data.requestId ?? null,
      },
    });
  }
}
