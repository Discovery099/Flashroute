import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createExecutorHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'strategies@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Strategy User',
    },
  });

  const user = harness.getUserByEmail('strategies@flashroute.test');
  harness.setUserRole(user!.id, 'executor');
  harness.setSubscriptionForUser(user!.id, {
    plan: 'executor',
    status: 'active',
    currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
  });

  const login = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'strategies@flashroute.test',
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
  const app = (context as { app?: Awaited<ReturnType<typeof createExecutorHarness>>['app'] }).app;

  await app?.close();
});

describe('strategy routes', () => {
  it('creates a disabled strategy with validated thresholds and returns it in the list/detail views', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const createResponse = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Arbitrum Main Strategy',
        chainId: 42161,
        description: 'Primary arbitrage route for Arb.',
        minProfitUsd: 12.5,
        maxHops: 4,
        cooldownSeconds: 45,
        riskBufferPct: 0.75,
        maxGasPriceGwei: 88,
        maxSlippageBps: 75,
        allowedDexes: ['uniswap_v3', 'sushiswap'],
        flashLoanProvider: 'balancer',
        useFlashbots: false,
        useDemandPrediction: false,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      success: true,
      data: {
        strategy: {
          name: 'Arbitrum Main Strategy',
          chainId: 42161,
          description: 'Primary arbitrage route for Arb.',
          isActive: false,
          minProfitUsd: 12.5,
          maxTradeSizeUsd: 100000,
          maxHops: 4,
          cooldownSeconds: 45,
          riskBufferPct: 0.75,
          maxGasPriceGwei: 88,
          maxSlippageBps: 75,
          allowedDexes: ['uniswap_v3', 'sushiswap'],
          flashLoanProvider: 'balancer',
          useFlashbots: false,
          useDemandPrediction: false,
        },
      },
    });

    const strategyId = createResponse.json().data.strategy.id as string;

    const listResponse = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/strategies?search=main&chainId=42161&isActive=false&page=1&limit=10',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      success: true,
      data: {
        strategies: [
          expect.objectContaining({
            id: strategyId,
            name: 'Arbitrum Main Strategy',
            chainId: 42161,
            isActive: false,
          }),
        ],
      },
      meta: {
        page: 1,
        limit: 10,
        total: 1,
      },
    });

    const detailResponse = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/strategies/${strategyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      success: true,
      data: {
        strategy: expect.objectContaining({
          id: strategyId,
          name: 'Arbitrum Main Strategy',
          description: 'Primary arbitrage route for Arb.',
          cooldownSeconds: 45,
          maxSlippageBps: 75,
          flashLoanProvider: 'balancer',
          useFlashbots: false,
          useDemandPrediction: false,
        }),
        performance: {
          executionCount: 0,
          totalProfitUsd: 0,
          successRate: 0,
          averageProfitUsd: 0,
          bestTradeUsd: 0,
        },
      },
    });
  });

  it('rejects invalid create input with field-level validation details', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'x',
        minProfitUsd: 0,
        maxHops: 8,
        riskBufferPct: 8,
        maxSlippageBps: 0,
        allowedDexes: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'chainId' }),
          expect.objectContaining({ field: 'minProfitUsd' }),
          expect.objectContaining({ field: 'maxHops' }),
          expect.objectContaining({ field: 'maxSlippageBps' }),
          expect.objectContaining({ field: 'allowedDexes' }),
        ]),
      },
    });
  });

  it('auto-deactivates an active strategy when patching it', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Hot Strategy',
        chainId: 1,
        minProfitUsd: 10,
        maxHops: 3,
        maxSlippageBps: 50,
        allowedDexes: ['uniswap_v2'],
      },
    });

    const strategyId = created.json().data.strategy.id as string;

    const activated = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/strategies/${strategyId}/activate`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(activated.statusCode).toBe(200);
    expect(activated.json().data.strategy.isActive).toBe(true);

    const updated = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/strategies/${strategyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Hot Strategy Updated',
        maxHops: 5,
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      success: true,
      data: {
        strategy: {
          id: strategyId,
          name: 'Hot Strategy Updated',
          maxHops: 5,
          isActive: false,
        },
      },
    });
  });

  it('rejects attempts to change chainId on patch', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Immutable Chain Strategy',
        chainId: 42161,
        allowedDexes: ['uniswap_v3'],
      },
    });

    const strategyId = created.json().data.strategy.id as string;

    const updated = await harness.app.inject({
      method: 'PATCH',
      url: `/api/v1/strategies/${strategyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        chainId: 1,
      },
    });

    expect(updated.statusCode).toBe(400);
    expect(updated.json()).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('supports activate, deactivate, and delete confirmation flows', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
      payload: {
        name: 'Delete Me',
        chainId: 42161,
        minProfitUsd: 9,
        maxHops: 3,
        maxSlippageBps: 40,
        allowedDexes: ['uniswap_v3'],
      },
    });

    const strategyId = created.json().data.strategy.id as string;

    const activateResponse = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/strategies/${strategyId}/activate`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(activateResponse.statusCode).toBe(200);
    expect(activateResponse.json().data.strategy.isActive).toBe(true);

    const deactivateResponse = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/strategies/${strategyId}/deactivate`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(deactivateResponse.statusCode).toBe(200);
    expect(deactivateResponse.json().data.strategy.isActive).toBe(false);

    const unconfirmedDelete = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/strategies/${strategyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(unconfirmedDelete.statusCode).toBe(400);
    expect(unconfirmedDelete.json().error.code).toBe('CONFIRMATION_REQUIRED');

    const confirmedDelete = await harness.app.inject({
      method: 'DELETE',
      url: `/api/v1/strategies/${strategyId}?confirm=true`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(confirmedDelete.statusCode).toBe(200);
    expect(confirmedDelete.json()).toMatchObject({
      success: true,
      data: {
        message: 'Strategy deleted',
      },
    });

    const deletedDetail = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/strategies/${strategyId}`,
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(deletedDetail.statusCode).toBe(404);
  });

  it('enforces plan gating for creation and strategy-count limits', async (context) => {
    const harness = await createTestApiHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'trader-limit@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Trader Limit',
      },
    });

    const trader = harness.getUserByEmail('trader-limit@flashroute.test');
    harness.setUserRole(trader!.id, 'trader');
    harness.setSubscriptionForUser(trader!.id, {
      plan: 'trader',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const traderLogin = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'trader-limit@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const traderFirst = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${traderLogin.json().data.accessToken as string}`,
      },
      payload: {
        name: 'Trader First',
        chainId: 1,
        minProfitUsd: 5,
        maxHops: 3,
        maxSlippageBps: 25,
        allowedDexes: ['uniswap_v2'],
      },
    });
    expect(traderFirst.statusCode).toBeGreaterThanOrEqual(200);

    const executorHarness = await createExecutorHarness();

    for (let index = 0; index < 10; index += 1) {
      const createResponse = await executorHarness.app.inject({
        method: 'POST',
        url: '/api/v1/strategies',
        headers: {
          authorization: `Bearer ${executorHarness.accessToken}`,
        },
        payload: {
          name: `Executor Strategy ${index + 1}`,
          chainId: 42161,
          minProfitUsd: 6,
          maxHops: 3,
          maxSlippageBps: 20,
          allowedDexes: ['uniswap_v3'],
        },
      });

      expect(createResponse.statusCode).toBe(201);
    }

    const overflowResponse = await executorHarness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: {
        authorization: `Bearer ${executorHarness.accessToken}`,
      },
      payload: {
        name: 'Executor Strategy 11',
        chainId: 42161,
        minProfitUsd: 6,
        maxHops: 3,
        maxSlippageBps: 20,
        allowedDexes: ['uniswap_v3'],
      },
    });

    expect(overflowResponse.statusCode).toBe(403);
    expect(overflowResponse.json().error.code).toBe('TIER_LIMIT');

    await executorHarness.app.close();
  });

  it('supports list filtering and pagination using chainId, isActive, page, and limit', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    for (const payload of [
      { name: 'Arb 1', chainId: 42161, allowedDexes: ['uniswap_v3'] },
      { name: 'Arb 2', chainId: 42161, allowedDexes: ['sushiswap'] },
      { name: 'Eth 1', chainId: 1, allowedDexes: ['uniswap_v2'] },
    ]) {
      const created = await harness.app.inject({
        method: 'POST',
        url: '/api/v1/strategies',
        headers: { authorization: `Bearer ${harness.accessToken}` },
        payload,
      });
      expect(created.statusCode).toBe(201);
    }

    const firstStrategyId = harness.listStrategiesByUserId(harness.userId)[0]!.id;
    const activated = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/strategies/${firstStrategyId}/activate`,
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });
    expect(activated.statusCode).toBe(200);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/strategies?chainId=42161&isActive=false&page=1&limit=1&search=Arb',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        strategies: [expect.objectContaining({ name: 'Arb 2', chainId: 42161, isActive: false })],
      },
      meta: {
        page: 1,
        limit: 1,
        total: 1,
      },
    });
  });

  it('prevents activation when the chain lacks executor contract foundation', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setSupportedChainExecutorContract(137, null);

    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: { authorization: `Bearer ${harness.accessToken}` },
      payload: {
        name: 'Polygon Strategy',
        chainId: 137,
        allowedDexes: ['curve'],
      },
    });

    expect(created.statusCode).toBe(404);
    expect(created.json()).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
      },
    });
  });

  it('rejects create when the selected chain lacks an active executor contract foundation', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.setSupportedChainExecutorContract(137, null);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/strategies',
      headers: { authorization: `Bearer ${harness.accessToken}` },
      payload: {
        name: 'Blocked Create Strategy',
        chainId: 137,
        allowedDexes: ['curve'],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
      },
    });
  });
});
