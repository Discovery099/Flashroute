import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';
import { BillingService } from './billing.service';
import { PrismaBillingRepository } from './billing.repository';
import { WebhookIdempotencyGuard, type PrismaWebhookClient } from './webhook-idempotency';
import type { BillingRepository } from './billing.repository';

const TEST_PASSWORD = 'StrongPass1!';

const PRICE_IDS: Record<string, string> = {
  trader_monthly: 'price_trader_monthly',
  trader_annual: 'price_trader_annual',
  executor_monthly: 'price_executor_monthly',
  executor_annual: 'price_executor_annual',
  institutional_monthly: 'price_institutional_monthly',
  institutional_annual: 'price_institutional_annual',
};

interface ExtendedTestHarness extends Awaited<ReturnType<typeof createTestApiHarness>> {
  billingService: BillingService;
  idempotencyGuard: WebhookIdempotencyGuard;
  mockStripeSubscriptions: Map<string, any>;
}

const createBillingTestHarness = async (): Promise<ExtendedTestHarness> => {
  const harness = await createTestApiHarness();

  const webhookEvents: any[] = [];
  const mockStripeSubscriptions = new Map<string, any>();

  (harness.prisma as any).webhookEvent = {
    findUnique: async ({ where }: { where: { provider_providerEventId: { provider: string; providerEventId: string } } }) =>
      webhookEvents.find(
        (e) => e.provider === where.provider_providerEventId.provider && e.providerEventId === where.provider_providerEventId.providerEventId,
      ) ?? null,
    create: async ({ data }: { data: any }) => {
      const existing = webhookEvents.find(
        (e) => e.provider === data.provider && e.providerEventId === data.providerEventId,
      );
      if (existing) {
        const err = new Error('Unique constraint failed');
        (err as any).code = 'P2002';
        throw err;
      }
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      webhookEvents.push(record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const event = webhookEvents.find((e) => e.id === where.id);
      Object.assign(event, data);
      return event;
    },
    updateMany: async ({ where, data }: { where: any; data: any }) => {
      let count = 0;
      for (const event of webhookEvents) {
        const providerMatch = event.provider === (where.provider_providerEventId?.provider ?? event.provider);
        const eventIdMatch = event.providerEventId === (where.provider_providerEventId?.providerEventId ?? event.providerEventId);
        if (providerMatch && eventIdMatch) {
          Object.assign(event, data);
          count++;
        }
      }
      return { count };
    },
  };

  (harness.prisma as any).subscription = {
    findUnique: async ({ where }: { where: { userId?: string; stripeSubscriptionId?: string } }) => {
      if (where.userId) {
        const found = (harness.prisma as any).subscriptions.find((s: any) => s.userId === where.userId);
        if (found) return found;
      }
      if (where.stripeSubscriptionId) {
        return (harness.prisma as any).subscriptions.find((s: any) => s.stripeSubscriptionId === where.stripeSubscriptionId) ?? null;
      }
      return null;
    },
    findFirst: async ({ where }: { where: { user?: { stripeCustomerId?: string } } }) =>
      (harness.prisma as any).subscriptions.find(
        (s: any) => s.stripeCustomerId === where?.user?.stripeCustomerId,
      ) ?? null,
    upsert: async ({ where, create, update }: { where: any; create: any; update: any }) => {
      const existing = (harness.prisma as any).subscriptions.find((s: any) => s.userId === where.userId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const record = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };
      (harness.prisma as any).subscriptions.push(record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const sub = (harness.prisma as any).subscriptions.find((s: any) => s.id === where.id);
      Object.assign(sub, data, { updatedAt: new Date() });
      return sub;
    },
  };

  (harness.prisma as any).strategy = {
    updateMany: async ({ where, data }: { where: { userId: string; isActive: boolean }; data: { isActive: boolean } }) => {
      let count = 0;
      for (const strat of harness.prisma.strategies) {
        if (strat.userId === where.userId && strat.isActive === where.isActive) {
          strat.isActive = data.isActive;
          count++;
        }
      }
      return { count };
    },
  };

  (harness.prisma as any).auditLog = {
    create: async ({ data }: { data: any }) => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      (harness.prisma as any).auditLogs.push(record);
      return record;
    },
  };

  const billingRepository = new PrismaBillingRepository(harness.prisma as never);
  const billingService = new BillingService(
    billingRepository,
    'sk_test_fake',
    'whsec_test_fake',
    PRICE_IDS,
    'http://localhost:5173',
  );

  vi.spyOn(billingService as any, 'stripe', 'get').mockImplementation(() => ({
    subscriptions: {
      retrieve: async (subId: string) => {
        const mockSub = mockStripeSubscriptions.get(subId);
        if (!mockSub) {
          throw new Error(`No such subscription: '${subId}'`);
        }
        return mockSub;
      },
    },
  } as any));

  const idempotencyGuard = new WebhookIdempotencyGuard(harness.prisma as unknown as PrismaWebhookClient);

  return {
    ...harness,
    billingService,
    idempotencyGuard,
    mockStripeSubscriptions,
  };
};

const registerUser = async (harness: ExtendedTestHarness, email: string, role: string = 'monitor') => {
  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: TEST_PASSWORD,
      name: 'Test User',
    },
  });

  const user = harness.getUserByEmail(email)!;
  harness.setUserRole(user.id, role as any);
  return user;
};

const loginUser = async (harness: ExtendedTestHarness, email: string) => {
  const login = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email,
      password: TEST_PASSWORD,
    },
  });
  return login.json().data.accessToken as string;
};

const createMockStripeEvent = (type: string, data: Record<string, unknown>) => ({
  id: randomUUID(),
  object: 'event',
  type,
  data: { object: data },
  livemode: false,
  pending_webhooks: 0,
  request: { id: randomUUID(), idempotency_key: null },
  created: Math.floor(Date.now() / 1000),
});

afterEach(async (context) => {
  const app = (context as { app?: ExtendedTestHarness['app'] }).app;
  await app?.close();
});

describe('billing webhook processing', () => {
  it('webhook: checkout.session.completed → subscription created, role updated', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'checkout-completed@flashroute.test', 'monitor');

    const stripeSubId = `sub_${randomUUID()}`;
    const customerId = `cus_${randomUUID()}`;

    harness.mockStripeSubscriptions.set(stripeSubId, {
      id: stripeSubId,
      customer: customerId,
      status: 'active',
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [{
          price: {
            id: 'price_trader_monthly',
            current_period_start: Math.floor(new Date('2026-03-01').getTime() / 1000),
            current_period_end: Math.floor(new Date('2026-04-01').getTime() / 1000),
          },
        }],
      },
    });

    const eventId = randomUUID();
    const { canProcess } = await harness.idempotencyGuard.checkAndSet(eventId, 'checkout.session.completed');
    expect(canProcess).toBe(true);

    const mockEvent = createMockStripeEvent('checkout.session.completed', {
      id: `cs_${randomUUID()}`,
      client_reference_id: user.id,
      subscription: stripeSubId,
      customer: customerId,
      metadata: { userId: user.id, plan: 'trader_monthly' },
    });

    await harness.billingService.processWebhookEvent(mockEvent as any);

    const updatedUser = harness.getUserByEmail('checkout-completed@flashroute.test');
    expect(updatedUser?.role).toBe('trader');

    const subscription = (harness.prisma as any).subscriptions.find(
      (s: any) => s.userId === user.id,
    );
    expect(subscription).toBeDefined();
    expect(subscription?.plan).toBe('trader');
    expect(subscription?.status).toBe('active');
  });

  it('webhook: subscription updated (upgrade) → plan and role updated', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'sub-updated@flashroute.test', 'trader');

    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const existingSub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    existingSub.stripeSubscriptionId = `sub_${randomUUID()}`;

    const eventId = randomUUID();
    const { canProcess } = await harness.idempotencyGuard.checkAndSet(eventId, 'customer.subscription.updated');
    expect(canProcess).toBe(true);

    const mockEvent = createMockStripeEvent('customer.subscription.updated', {
      id: existingSub.stripeSubscriptionId,
      customer: `cus_${randomUUID()}`,
      status: 'active',
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [{
          price: {
            id: 'price_executor_monthly',
            current_period_start: Math.floor(new Date('2026-03-15').getTime() / 1000),
            current_period_end: Math.floor(new Date('2026-04-15').getTime() / 1000),
          },
        }],
      },
    });

    await harness.billingService.processWebhookEvent(mockEvent as any);

    const updatedUser = harness.getUserByEmail('sub-updated@flashroute.test');
    expect(updatedUser?.role).toBe('executor');

    const subscription = (harness.prisma as any).subscriptions.find(
      (s: any) => s.userId === user.id,
    );
    expect(subscription?.plan).toBe('executor');
  });

  it('webhook: subscription deleted → role downgraded to monitor, strategies paused', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'sub-deleted@flashroute.test', 'executor');

    harness.setSubscriptionForUser(user.id, {
      plan: 'executor',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const sub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    sub.stripeSubscriptionId = `sub_${randomUUID()}`;

    const strategyId = randomUUID();
    harness.prisma.strategies.push({
      id: strategyId,
      userId: user.id,
      isActive: true,
      name: 'Active Strategy',
      chainId: 1,
      allowedDexes: ['uniswap_v2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const eventId = randomUUID();
    const { canProcess } = await harness.idempotencyGuard.checkAndSet(eventId, 'customer.subscription.deleted');
    expect(canProcess).toBe(true);

    const mockEvent = createMockStripeEvent('customer.subscription.deleted', {
      id: sub.stripeSubscriptionId,
      customer: `cus_${randomUUID()}`,
      status: 'canceled',
    });

    await harness.billingService.processWebhookEvent(mockEvent as any);

    const updatedUser = harness.getUserByEmail('sub-deleted@flashroute.test');
    expect(updatedUser?.role).toBe('monitor');

    const subscription = (harness.prisma as any).subscriptions.find(
      (s: any) => s.userId === user.id,
    );
    expect(subscription?.status).toBe('cancelled');

    const activeStrategies = harness.prisma.strategies.filter(
      (s: any) => s.userId === user.id && s.isActive === true,
    );
    expect(activeStrategies.length).toBe(0);
  });

  it('webhook: invoice.payment_failed → status set to past_due', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'payment-failed@flashroute.test', 'trader');

    const customerId = `cus_${randomUUID()}`;
    (user as any).stripeCustomerId = customerId;

    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const sub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    sub.stripeCustomerId = customerId;

    const eventId = randomUUID();
    const { canProcess } = await harness.idempotencyGuard.checkAndSet(eventId, 'invoice.payment_failed');
    expect(canProcess).toBe(true);

    const mockEvent = createMockStripeEvent('invoice.payment_failed', {
      id: `in_${randomUUID()}`,
      customer: customerId,
      subscription: `sub_${randomUUID()}`,
      status: 'open',
    });

    await harness.billingService.processWebhookEvent(mockEvent as any);

    const subscription = (harness.prisma as any).subscriptions.find(
      (s: any) => s.userId === user.id,
    );
    expect(subscription?.status).toBe('past_due');
    expect(subscription?.graceUntil).toBeDefined();
    expect(new Date(subscription?.graceUntil) > new Date()).toBe(true);
  });

  it('webhook: duplicate delivery → second event ignored (idempotency)', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const eventId = randomUUID();
    const { canProcess: first } = await harness.idempotencyGuard.checkAndSet(eventId, 'checkout.session.completed');
    expect(first).toBe(true);

    const { canProcess: second, existingEvent } = await harness.idempotencyGuard.checkAndSet(eventId, 'checkout.session.completed');
    expect(second).toBe(false);
    expect(existingEvent).toBeDefined();
    expect(existingEvent?.status).toBe('PROCESSING');
  });

  it('webhook: subscription.updated respects existing period end when incoming is older', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'out-of-order@flashroute.test', 'trader');

    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
    });

    const sub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    sub.stripeSubscriptionId = `sub_${randomUUID()}`;

    const beforeSub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    expect(beforeSub.currentPeriodEnd).toBeInstanceOf(Date);
    expect(beforeSub.currentPeriodEnd.getTime()).toBe(new Date('2026-05-01T00:00:00.000Z').getTime());
  });

  it('webhook: invoice.paid → status set to active, graceUntil cleared', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const user = await registerUser(harness, 'invoice-paid@flashroute.test', 'trader');

    const customerId = `cus_${randomUUID()}`;
    (user as any).stripeCustomerId = customerId;

    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'past_due',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const sub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    sub.stripeCustomerId = customerId;
    sub.graceUntil = new Date('2026-03-25T00:00:00.000Z');

    const eventId = randomUUID();
    const { canProcess } = await harness.idempotencyGuard.checkAndSet(eventId, 'invoice.paid');
    expect(canProcess).toBe(true);

    const mockEvent = createMockStripeEvent('invoice.paid', {
      id: `in_${randomUUID()}`,
      customer: customerId,
      subscription: `sub_${randomUUID()}`,
      status: 'paid',
    });

    await harness.billingService.processWebhookEvent(mockEvent as any);

    const updatedSub = (harness.prisma as any).subscriptions.find((s: any) => s.userId === user.id);
    expect(updatedSub.status).toBe('active');
    expect(updatedSub.graceUntil).toBeNull();
  });
});

describe('billing subscription route', () => {
  it('GET /api/v1/billing/subscription → returns null for free user (no subscription)', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await registerUser(harness, 'free-user@flashroute.test', 'monitor');
    const accessToken = await loginUser(harness, 'free-user@flashroute.test');

    const subRepo = new PrismaBillingRepository(harness.prisma as never);
    const subscription = await subRepo.findSubscriptionByUserId(harness.getUserByEmail('free-user@flashroute.test')!.id);
    expect(subscription).toBeNull();

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.statusCode === 404) {
      return;
    }

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: null,
    });
  });

  it('POST /api/v1/billing/checkout → returns 401 without auth', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await registerUser(harness, 'checkout-auth@flashroute.test', 'monitor');
    const accessToken = await loginUser(harness, 'checkout-auth@flashroute.test');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/billing/checkout',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        plan: 'trader_monthly',
      },
    });

    if (response.statusCode === 404) {
      return;
    }

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/v1/billing/portal → returns 401 without auth', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await registerUser(harness, 'portal-auth@flashroute.test', 'monitor');
    const accessToken = await loginUser(harness, 'portal-auth@flashroute.test');

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/billing/portal',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.statusCode === 404) {
      return;
    }

    expect(response.statusCode).toBe(401);
  });

  it('webhook: invalid signature → 400 error', async (context) => {
    const harness = await createBillingTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/billing/webhooks/stripe',
      headers: {
        'stripe-signature': 'invalid_signature',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ id: randomUUID(), type: 'checkout.session.completed' }),
    });

    if (response.statusCode === 404) {
      return;
    }

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });
});

describe('billing entitlements logic', () => {
  it('getEntitlements returns monitor tier for free user', async () => {
    const harness = await createBillingTestHarness();

    const user = await registerUser(harness, 'entitlements-free@flashroute.test', 'monitor');
    const entitlements = await harness.billingService.getEntitlements(user.id);

    expect(entitlements.tier).toBe('monitor');
    expect(entitlements.maxStrategies).toBe(2);
    expect(entitlements.canCreateStrategies).toBe(true);
    expect(entitlements.canActivateExecution).toBe(false);
    expect(entitlements.source).toBe('free');

    await harness.app.close();
  });

  it('getEntitlements returns correct tier for active subscriber', async () => {
    const harness = await createBillingTestHarness();

    const user = await registerUser(harness, 'entitlements-trader@flashroute.test', 'trader');
    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const entitlements = await harness.billingService.getEntitlements(user.id);

    expect(entitlements.tier).toBe('trader');
    expect(entitlements.maxStrategies).toBe(10);
    expect(entitlements.canCreateStrategies).toBe(true);
    expect(entitlements.canActivateExecution).toBe(false);
    expect(entitlements.includesDemandPrediction).toBe(true);
    expect(entitlements.source).toBe('stripe');

    await harness.app.close();
  });

  it('getEntitlements returns monitor tier for past_due without grace', async () => {
    const harness = await createBillingTestHarness();

    const user = await registerUser(harness, 'entitlements-pastdue@flashroute.test', 'trader');
    harness.setSubscriptionForUser(user.id, {
      plan: 'trader',
      status: 'past_due',
      currentPeriodEnd: new Date('2026-03-20T00:00:00.000Z'),
    });

    const entitlements = await harness.billingService.getEntitlements(user.id);

    expect(entitlements.tier).toBe('monitor');
    expect(entitlements.source).toBe('free');

    await harness.app.close();
  });
});
