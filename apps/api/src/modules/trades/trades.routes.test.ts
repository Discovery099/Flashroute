import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createExecutorHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'trades@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Trade User',
    },
  });

  const user = harness.getUserByEmail('trades@flashroute.test');
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
      email: 'trades@flashroute.test',
      password: TEST_PASSWORD,
    },
  });

  const strategy = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/strategies',
    headers: { authorization: `Bearer ${login.json().data.accessToken as string}` },
    payload: {
      name: 'Test Strategy',
      chainId: 1,
      allowedDexes: ['uniswap_v3'],
    },
  });

  return {
    ...harness,
    accessToken: login.json().data.accessToken as string,
    userId: user!.id,
    strategyId: strategy.json().data.strategy.id as string,
  };
};

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createExecutorHarness>>['app'] }).app;
  await app?.close();
});

describe('trade routes', () => {
  it('lists trades with filters and pagination', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const routePath = [
      { pool: '0x1111111111111111111111111111111111111111', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' },
      { pool: '0x2222222222222222222222222222222222222222', tokenIn: 'USDC', tokenOut: 'WETH', dex: 'sushiswap' },
    ];

    for (let i = 0; i < 3; i += 1) {
      const now = new Date();
      harness.prisma.trades.push({
        id: `trade-${i}`,
        strategyId: harness.strategyId,
        userId: harness.userId,
        chainId: 1,
        status: 'detected',
        txHash: null,
        blockNumber: null,
        routePath,
        routeHops: 2,
        flashLoanProvider: 'auto',
        flashLoanToken: '0x0000000000000000000000000000000000000000',
        flashLoanAmount: 1000000000000000000,
        flashLoanFee: 900000000000000,
        profitRaw: null,
        profitUsd: null,
        gasUsed: null,
        gasPriceGwei: null,
        gasCostUsd: null,
        netProfitUsd: null,
        simulatedProfitUsd: 12.5,
        slippagePct: null,
        demandPredictionUsed: false,
        competingTxsInBlock: null,
        errorMessage: null,
        executionTimeMs: 150,
        submittedAt: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const listResponse = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/trades?chainId=1&page=1&limit=2',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      success: true,
      data: {
        trades: expect.any(Array),
      },
      meta: {
        page: 1,
        limit: 2,
        total: expect.any(Number),
      },
    });
  });

  it('returns trade detail with hops array', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const now = new Date();
    const tradeId = 'trade-detail-test';
    harness.prisma.trades.push({
      id: tradeId,
      strategyId: harness.strategyId,
      userId: harness.userId,
      chainId: 1,
      status: 'detected',
      txHash: null,
      blockNumber: null,
      routePath: [{ pool: '0x1111', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' }],
      routeHops: 1,
      flashLoanProvider: 'aave',
      flashLoanToken: '0x0000000000000000000000000000000000000000',
      flashLoanAmount: 1000000,
      flashLoanFee: 9000,
      profitRaw: null,
      profitUsd: null,
      gasUsed: null,
      gasPriceGwei: null,
      gasCostUsd: null,
      netProfitUsd: null,
      simulatedProfitUsd: 5.0,
      slippagePct: null,
      demandPredictionUsed: false,
      competingTxsInBlock: null,
      errorMessage: null,
      executionTimeMs: 100,
      submittedAt: null,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    harness.prisma.tradeHops.push({
      id: 'hop-1',
      tradeId,
      hopIndex: 0,
      poolId: 'pool-1',
      tokenInId: 'token-in-1',
      tokenOutId: 'token-out-1',
      amountIn: 1000000,
      amountOut: 1000500,
      expectedAmountOut: 1000600,
      slippagePct: 0.001,
      createdAt: now,
    });

    const detailResponse = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}`,
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      success: true,
      data: {
        trade: expect.objectContaining({
          id: tradeId,
          chainId: 1,
          status: 'detected',
        }),
        hops: expect.any(Array),
      },
    });
  });

  it('returns 404 for non-owned trade', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const secondHarness = await createTestApiHarness();
    await secondHarness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'trades2@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Trade User 2',
      },
    });
    const secondUser = secondHarness.getUserByEmail('trades2@flashroute.test');
    harness.setUserRole(secondUser!.id, 'executor');
    harness.setSubscriptionForUser(secondUser!.id, {
      plan: 'executor',
      status: 'active',
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
    });

    const secondLogin = await secondHarness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'trades2@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    const now = new Date();
    const tradeId = 'trade-other-user';
    harness.prisma.trades.push({
      id: tradeId,
      strategyId: harness.strategyId,
      userId: harness.userId,
      chainId: 1,
      status: 'detected',
      txHash: null,
      blockNumber: null,
      routePath: [{ pool: '0x1111', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' }],
      routeHops: 1,
      flashLoanProvider: 'auto',
      flashLoanToken: '0x0000000000000000000000000000000000000000',
      flashLoanAmount: 1000000,
      flashLoanFee: 9000,
      profitRaw: null,
      profitUsd: null,
      gasUsed: null,
      gasPriceGwei: null,
      gasCostUsd: null,
      netProfitUsd: null,
      simulatedProfitUsd: 5.0,
      slippagePct: null,
      demandPredictionUsed: false,
      competingTxsInBlock: null,
      errorMessage: null,
      executionTimeMs: 100,
      submittedAt: null,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const forbiddenResponse = await secondHarness.app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}`,
      headers: { authorization: `Bearer ${secondLogin.json().data.accessToken as string}` },
    });

    expect(forbiddenResponse.statusCode).toBe(404);

    await secondHarness.app.close();
  });

  it('returns trade summary with correct aggregates', async (context) => {
    const harness = await createExecutorHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    const now = new Date();
    harness.prisma.trades.push({
      id: 'settled-trade',
      strategyId: harness.strategyId,
      userId: harness.userId,
      chainId: 1,
      status: 'settled',
      txHash: '0xabc',
      blockNumber: 12345678n,
      routePath: [{ pool: '0x1111', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' }],
      routeHops: 1,
      flashLoanProvider: 'auto',
      flashLoanToken: '0x0000000000000000000000000000000000000000',
      flashLoanAmount: 1000000,
      flashLoanFee: 9000,
      profitRaw: 3500000,
      profitUsd: 3.5,
      gasUsed: 150000n,
      gasPriceGwei: 30.5,
      gasCostUsd: 0.5,
      netProfitUsd: 3.0,
      simulatedProfitUsd: 5.0,
      slippagePct: 0.001,
      demandPredictionUsed: false,
      competingTxsInBlock: null,
      errorMessage: null,
      executionTimeMs: 100,
      submittedAt: now,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    harness.prisma.trades.push({
      id: 'reverted-trade',
      strategyId: harness.strategyId,
      userId: harness.userId,
      chainId: 1,
      status: 'reverted',
      txHash: '0xdef',
      blockNumber: 12345679n,
      routePath: [{ pool: '0x2222', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap_v3' }],
      routeHops: 1,
      flashLoanProvider: 'auto',
      flashLoanToken: '0x0000000000000000000000000000000000000000',
      flashLoanAmount: 1000000,
      flashLoanFee: 9000,
      profitRaw: -2000000,
      profitUsd: -2.0,
      gasUsed: 150000n,
      gasPriceGwei: 30.5,
      gasCostUsd: 1.0,
      netProfitUsd: -3.0,
      simulatedProfitUsd: 5.0,
      slippagePct: 0.002,
      demandPredictionUsed: false,
      competingTxsInBlock: 2,
      errorMessage: 'Reverted: insufficient liquidity',
      executionTimeMs: 100,
      submittedAt: now,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const summaryResponse = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/trades/summary',
      headers: { authorization: `Bearer ${harness.accessToken}` },
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json()).toMatchObject({
      success: true,
      data: {
        summary: expect.objectContaining({
          totalTrades: 2,
          successfulTrades: 1,
          failedTrades: 1,
          netProfitUsd: 0,
          totalGasCostUsd: 1.5,
          topRoutes: expect.any(Array),
          profitByDay: expect.any(Array),
        }),
      },
    });
  });
});
