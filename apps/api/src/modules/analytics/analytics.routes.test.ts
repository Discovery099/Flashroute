import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createExecutorHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'analytics@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Analytics User',
    },
  });

  const user = harness.getUserByEmail('analytics@flashroute.test');
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
      email: 'analytics@flashroute.test',
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

describe('analytics routes', () => {
  it('GET /analytics/overview returns profit/volume/successRate trends and daily breakdown', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.prisma.trades.push(
      { id: '1', userId: harness.userId, chainId: 1, status: 'settled', netProfitUsd: { toString: () => '100' }, gasCostUsd: { toString: () => '10' }, profitUsd: { toString: () => '110' }, createdAt: new Date('2026-03-14T00:00:00Z'), updatedAt: new Date() },
      { id: '2', userId: harness.userId, chainId: 1, status: 'settled', netProfitUsd: { toString: () => '50' }, gasCostUsd: { toString: () => '5' }, profitUsd: { toString: () => '55' }, createdAt: new Date('2026-03-14T00:00:00Z'), updatedAt: new Date() },
      { id: '3', userId: harness.userId, chainId: 1, status: 'reverted', netProfitUsd: { toString: () => '-10' }, gasCostUsd: { toString: () => '5' }, profitUsd: { toString: () => '-5' }, createdAt: new Date('2026-03-15T00:00:00Z'), updatedAt: new Date() },
    );

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/analytics/overview?period=7d',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.profitTrend).toBeDefined();
    expect(body.data.volumeTrend).toBeDefined();
    expect(body.data.successRateTrend).toBeDefined();
    expect(body.data.dailyBreakdown).toBeDefined();
  });

  it('GET /analytics/routes aggregates trades by route path', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.prisma.trades.push(
      { id: '1', userId: harness.userId, chainId: 1, status: 'settled', routePath: [{ tokenIn: 'WETH', tokenOut: 'USDC' }], netProfitUsd: { toString: () => '100' }, gasUsed: { toString: () => '150000' }, slippagePct: { toString: () => '0.001' }, executionTimeMs: 100, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', userId: harness.userId, chainId: 1, status: 'settled', routePath: [{ tokenIn: 'WETH', tokenOut: 'USDC' }], netProfitUsd: { toString: () => '50' }, gasUsed: { toString: () => '150000' }, slippagePct: { toString: () => '0.001' }, executionTimeMs: 100, createdAt: new Date(), updatedAt: new Date() },
    );

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/analytics/routes?period=7d&limit=10',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.routes).toHaveLength(1);
    expect(body.data.routes[0].executionCount).toBe(2);
    expect(body.data.routes[0].successCount).toBe(2);
    expect(body.data.routes[0].totalProfitUsd).toBe(150);
  });

  it('GET /analytics/competitors aggregates competitor_activity, ourWinRate is null', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.prisma.competitorActivityData.push(
      { id: '1', chainId: 1, botAddress: '0xABC', routePath: [{ tokenIn: 'WETH', tokenOut: 'USDC' }], estimatedProfitUsd: { toString: () => '100' }, gasPriceGwei: { toString: () => '20' }, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', chainId: 1, botAddress: '0xABC', routePath: [{ tokenIn: 'WETH', tokenOut: 'USDC' }], estimatedProfitUsd: { toString: () => '80' }, gasPriceGwei: { toString: () => '25' }, createdAt: new Date(), updatedAt: new Date() },
    );

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/analytics/competitors?chainId=1',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.ourWinRate).toBeNull();
    expect(body.data.competitors).toHaveLength(1);
    expect(body.data.competitors[0].botAddress).toBe('0xABC');
  });

  it('GET /analytics/gas returns gasSpentTotalUsd from trades, currentBaseFeeGwei mocked', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    harness.prisma.trades.push(
      { id: '1', userId: harness.userId, chainId: 1, gasCostUsd: { toString: () => '10' }, gasUsed: { toString: () => '150000' }, gasPriceGwei: { toString: () => '20' }, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', userId: harness.userId, chainId: 1, gasCostUsd: { toString: () => '15' }, gasUsed: { toString: () => '200000' }, gasPriceGwei: { toString: () => '25' }, createdAt: new Date(), updatedAt: new Date() },
    );

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: '2.0', result: '0x4A817C800' }), { status: 200 })
    );

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/analytics/gas?chainId=1&period=7d',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.gas.gasSpentTotalUsd).toBe(25);
    expect(body.data.gas.currentBaseFeeGwei).toBe(20);

    fetchMock.mockRestore();
  });
});
