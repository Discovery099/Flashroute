import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createAlertsTestHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'alerts@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Alerts User',
    },
  });

  const user = harness.getUserByEmail('alerts@flashroute.test');
  harness.setUserRole(user!.id, 'trader');
  harness.setSubscriptionForUser(user!.id, {
    plan: 'trader',
    status: 'active',
    currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
  });

  const login = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'alerts@flashroute.test',
      password: TEST_PASSWORD,
    },
  });

  return {
    ...harness,
    accessToken: login.json().data.accessToken as string,
    userId: user!.id,
  };
};

const createMonitorHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'monitor@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Monitor User',
    },
  });

  const user = harness.getUserByEmail('monitor@flashroute.test');
  harness.setUserRole(user!.id, 'monitor');
  harness.setSubscriptionForUser(user!.id, {
    plan: 'monitor',
    status: 'active',
    currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
  });

  const login = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'monitor@flashroute.test',
      password: TEST_PASSWORD,
    },
  });

  return {
    ...harness,
    accessToken: login.json().data.accessToken as string,
    userId: user!.id,
  };
};

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createAlertsTestHarness>>['app'] }).app;
  await app?.close();
});

describe('alerts routes', () => {
  it('lists alerts as authenticated user', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        alerts: [],
      },
      meta: {
        page: 1,
        limit: 20,
        total: 0,
      },
    });
  });

  it('creates alert with valid input', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'profit_threshold',
        chainId: 1,
        thresholdValue: 100,
        deliveryChannel: 'dashboard',
        cooldownSeconds: 60,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      success: true,
      data: {
        alert: {
          type: 'profit_threshold',
          chainId: 1,
          thresholdValue: 100,
          deliveryChannel: 'dashboard',
          isActive: true,
          cooldownSeconds: 60,
        },
      },
    });

    const alertId = createResponse.json().data.alert.id;

    const listResponse = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.alerts).toHaveLength(1);
    expect(listResponse.json().data.alerts[0].id).toBe(alertId);

    const getResponse = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/alerts/${alertId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().data.alert.id).toBe(alertId);
  });

  it('creates alert with telegram channel and valid chatId', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'trade_executed',
        deliveryChannel: 'telegram',
        deliveryConfig: { chatId: '123456789' },
        cooldownSeconds: 30,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().data.alert.deliveryChannel).toBe('telegram');
    expect(createResponse.json().data.alert.deliveryConfig.chatId).toBe('123456789');
  });

  it('creates alert with webhook channel and valid URL', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'gas_spike',
        deliveryChannel: 'webhook',
        deliveryConfig: { url: 'https://example.com/webhook' },
        cooldownSeconds: 60,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().data.alert.deliveryChannel).toBe('webhook');
    expect(createResponse.json().data.alert.deliveryConfig.url).toBe('https://example.com/webhook');
  });

  it('fails at tier limit for monitor tier', async (context) => {
    const monitorHarness = await createMonitorHarness();
    (context as { app?: typeof monitorHarness.app }).app = monitorHarness.app;

    for (let i = 0; i < 5; i++) {
      const createResponse = await monitorHarness.app.inject({
        method: 'POST',
        url: '/api/v1/alerts',
        headers: {
          authorization: `Bearer ${monitorHarness.accessToken}`,
        },
        payload: {
          type: 'opportunity_found',
          deliveryChannel: 'dashboard',
        },
      });
      expect(createResponse.statusCode).toBe(201);
    }

    const overflowResponse = await monitorHarness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${monitorHarness.accessToken}`,
      },
      payload: {
        type: 'opportunity_found',
        deliveryChannel: 'dashboard',
      },
    });

    expect(overflowResponse.statusCode).toBe(403);
    expect(overflowResponse.json().error.code).toBe('TIER_LIMIT');

    await monitorHarness.app.close();
  });

  it('updates alert', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'profit_threshold',
        deliveryChannel: 'dashboard',
        cooldownSeconds: 60,
      },
    });

    const alertId = createResponse.json().data.alert.id;

    const updateResponse = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/alerts/${alertId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        thresholdValue: 250,
        cooldownSeconds: 120,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.alert.thresholdValue).toBe(250);
    expect(updateResponse.json().data.alert.cooldownSeconds).toBe(120);
  });

  it('soft deletes alert (sets is_active=false)', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'trade_failed',
        deliveryChannel: 'email',
      },
    });

    const alertId = createResponse.json().data.alert.id;

    const deleteResponse = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/alerts/${alertId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      success: true,
      data: { message: 'Alert deleted' },
    });

    const listResponse = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(listResponse.json().data.alerts).toHaveLength(0);
  });

  it('non-owner cannot access others alerts', async (context) => {
    const harness1 = await createAlertsTestHarness();
    (context as { app?: typeof harness1.app }).app = harness1.app;

    const createResponse = await harness1.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness1.accessToken}`,
      },
      payload: {
        type: 'system_error',
        deliveryChannel: 'dashboard',
      },
    });

    const alertId = createResponse.json().data.alert.id;

    const harness2 = await createTestApiHarness();
    await harness2.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'other@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Other User',
      },
    });

    const otherUser = harness2.getUserByEmail('other@flashroute.test');
    harness2.setUserRole(otherUser!.id, 'trader');
    harness2.setSubscriptionForUser(otherUser!.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const login = await harness2.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'other@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const otherToken = login.json().data.accessToken as string;

    const accessResponse = await harness2.app.inject({
      method: 'GET',
      url: `/api/v1/alerts/${alertId}`,
      headers: {
        authorization: `Bearer ${otherToken}`,
      },
    });

    expect(accessResponse.statusCode).toBe(404);
    expect(accessResponse.json().error.code).toBe('NOT_FOUND');

    await harness2.app.close();
  });

  it('validation: positive threshold', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'profit_threshold',
        thresholdValue: -50,
        deliveryChannel: 'dashboard',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('validation: cooldown minimum 10s', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'profit_threshold',
        deliveryChannel: 'dashboard',
        cooldownSeconds: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('validation: invalid telegram chatId format', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'trade_executed',
        deliveryChannel: 'telegram',
        deliveryConfig: { chatId: 'invalid-chat-id' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('validation: invalid webhook URL format', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'gas_spike',
        deliveryChannel: 'webhook',
        deliveryConfig: { url: 'not-a-valid-url' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('gets alert history', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'trade_executed',
        deliveryChannel: 'dashboard',
      },
    });

    const alertId = createResponse.json().data.alert.id;

    harness.prisma.alertHistoryData.push({
      id: 'history-1',
      alertId,
      userId: harness.userId,
      tradeId: null,
      message: 'Test alert delivery',
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date(),
      errorMessage: null,
      createdAt: new Date(),
    });

    harness.prisma.alertHistoryData.push({
      id: 'history-2',
      alertId,
      userId: harness.userId,
      tradeId: null,
      message: 'Another test delivery',
      deliveryStatus: 'FAILED',
      deliveredAt: null,
      errorMessage: 'Delivery failed',
      createdAt: new Date(),
    });

    const historyResponse = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/alerts/${alertId}/history`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json().data.history).toHaveLength(2);
    expect(historyResponse.json().meta.total).toBe(2);
  });

  it('updates alert isActive to false on soft delete', async (context) => {
    const harness = await createAlertsTestHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/alerts',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        type: 'opportunity_found',
        deliveryChannel: 'dashboard',
      },
    });

    const alertId = createResponse.json().data.alert.id;

    await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/alerts/${alertId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    const alertRecord = harness.prisma.strategies.find((a: any) => a.id === alertId);
    expect(alertRecord).toBeUndefined();
  });
});
