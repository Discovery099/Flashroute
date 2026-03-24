import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const createTraderHarness = async () => {
  const harness = await createTestApiHarness();

  await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'opportunities@flashroute.test',
      password: TEST_PASSWORD,
      name: 'Opportunities User',
    },
  });

  const user = harness.getUserByEmail('opportunities@flashroute.test');
  harness.setUserRole(user!.id, 'trader');

  const login = await harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: 'opportunities@flashroute.test',
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
  const app = (context as { app?: Awaited<ReturnType<typeof createTraderHarness>>['app'] }).app;

  await app?.close();
});

describe('opportunities and dashboard routes', () => {
  it('supports the spec query contract and returns the documented opportunities payload shape', async (context) => {
    const harness = await createTraderHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.seedOpportunities(42161, [
      {
        id: 'opp-high',
        chainId: 42161,
        routePath: [
          { poolAddress: '0xpool-a', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap-v3' },
          { poolAddress: '0xpool-b', tokenIn: 'USDC', tokenOut: 'WETH', dex: 'curve' },
        ],
        estimatedProfitUsd: 42.15,
        confidenceScore: 0.92,
        flashLoan: { provider: 'balancer', token: 'WETH', amount: '25.0' },
        gasEstimate: { usd: 5.21, gwei: 0.18 },
        expiresAt: '2026-03-22T12:00:10.000Z',
        expiresInMs: 10_000,
        hops: 2,
        demandPrediction: { badge: 'high-impact', impactedPools: 2, predictedProfitChangeUsd: -3.4 },
        discoveredAt: '2026-03-22T12:00:00.000Z',
      },
      {
        id: 'opp-mid',
        chainId: 42161,
        routePath: [{ poolAddress: '0xpool-c', tokenIn: 'ARB', tokenOut: 'USDC', dex: 'uniswap-v2' }],
        estimatedProfitUsd: 18.5,
        confidenceScore: 0.74,
        flashLoan: { provider: 'aave', token: 'USDC', amount: '12000' },
        gasEstimate: { usd: 2.03, gwei: 0.07 },
        expiresAt: '2026-03-22T12:00:08.000Z',
        expiresInMs: 8_000,
        hops: 1,
        demandPrediction: { badge: 'watch', impactedPools: 1, predictedProfitChangeUsd: -0.8 },
        discoveredAt: '2026-03-22T12:00:01.000Z',
      },
      {
        id: 'opp-low-hops',
        chainId: 42161,
        routePath: [
          { poolAddress: '0xpool-d1', tokenIn: 'WBTC', tokenOut: 'WETH', dex: 'balancer' },
          { poolAddress: '0xpool-d2', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'curve' },
          { poolAddress: '0xpool-d3', tokenIn: 'USDC', tokenOut: 'WBTC', dex: 'uniswap-v2' },
        ],
        estimatedProfitUsd: 7.1,
        confidenceScore: 0.61,
        flashLoan: { provider: 'balancer', token: 'WBTC', amount: '0.75' },
        gasEstimate: { usd: 1.55, gwei: 0.05 },
        expiresAt: '2026-03-22T12:00:06.000Z',
        expiresInMs: 6_000,
        hops: 3,
        demandPrediction: { badge: 'low-impact', impactedPools: 0, predictedProfitChangeUsd: 0 },
        discoveredAt: '2026-03-22T12:00:02.000Z',
      },
    ]);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/routes/opportunities?chainId=42161&minProfitUsd=10&maxHops=2&limit=2',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        opportunities: [
          {
            id: 'opp-high',
            chainId: 42161,
            routePath: [
              expect.objectContaining({
                pool: '0xpool-a',
                tokenIn: 'WETH',
                tokenOut: 'USDC',
                dex: 'uniswap_v3',
              }),
              expect.objectContaining({
                pool: '0xpool-b',
                dex: 'curve',
              }),
            ],
            hops: 2,
            estimatedProfitUsd: 42.15,
            confidenceScore: 0.92,
            flashLoanToken: 'WETH',
            flashLoanAmount: '25.0',
            gasEstimateGwei: 0.18,
            expiresInMs: 10_000,
            demandPrediction: { impactedPools: 2, predictedProfitChange: -3.4, badge: 'high-impact' },
            discoveredAt: '2026-03-22T12:00:00.000Z',
          },
          {
            id: 'opp-mid',
            estimatedProfitUsd: 18.5,
            flashLoanToken: 'USDC',
          },
        ],
      },
      meta: {
        limit: 2,
        total: 2,
      },
    });
    expect(response.json().data.opportunities).toHaveLength(2);
    expect(harness.getOpportunityRedisReadCount(42161)).toBe(1);
  });

  it('excludes expired opportunities, cleans them from redis, and returns dashboard shell data for the requested period', async (context) => {
    const harness = await createTraderHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.seedOpportunities(1, [
      {
        id: 'opp-expired',
        chainId: 1,
        routePath: [{ poolAddress: '0xold', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap-v3' }],
        estimatedProfitUsd: 13.2,
        confidenceScore: 0.55,
        flashLoan: { provider: 'aave', token: 'WETH', amount: '5' },
        gasEstimate: { usd: 3.2, gwei: 0.14 },
        expiresAt: '2026-03-22T11:59:00.000Z',
        expiresInMs: -60_000,
        hops: 1,
        demandPrediction: { badge: 'stale', impactedPools: 1, predictedProfitChangeUsd: -5.1 },
        discoveredAt: '2026-03-22T11:58:00.000Z',
      },
      {
        id: 'opp-active',
        chainId: 1,
        routePath: [
          { poolAddress: '0xnew-1', tokenIn: 'WETH', tokenOut: 'DAI', dex: 'curve' },
          { poolAddress: '0xnew-2', tokenIn: 'DAI', tokenOut: 'WETH', dex: 'uniswap-v2' },
        ],
        estimatedProfitUsd: 27.45,
        confidenceScore: 0.88,
        flashLoan: { provider: 'balancer', token: 'DAI', amount: '18000' },
        gasEstimate: { usd: 4.8, gwei: 0.2 },
        expiresAt: '2026-03-22T12:00:30.000Z',
        expiresInMs: 30_000,
        hops: 2,
        demandPrediction: { badge: 'high-impact', impactedPools: 3, predictedProfitChangeUsd: -1.4 },
        discoveredAt: '2026-03-22T12:00:00.000Z',
      },
    ]);

    const opportunities = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/routes/opportunities?chainId=1&limit=20',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(opportunities.statusCode).toBe(200);
    expect(opportunities.json().data.opportunities).toEqual([
      expect.objectContaining({
        id: 'opp-active',
        flashLoanToken: 'DAI',
        gasEstimateGwei: 0.2,
        demandPrediction: expect.objectContaining({ badge: 'high-impact', predictedProfitChange: -1.4 }),
      }),
    ]);
    expect(await harness.hasOpportunity(1, 'opp-expired')).toBe(false);

    const dashboard = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/analytics/dashboard?chainId=1&period=7d',
      headers: {
        authorization: `Bearer ${harness.accessToken}`,
      },
    });

    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toMatchObject({
      success: true,
      data: {
        dashboard: {
          period: '7d',
          totalProfitUsd: 0,
          todayProfitUsd: 0,
          totalTrades: 0,
          successRate: 0,
          activeStrategies: 0,
          liveOpportunitiesCount: 1,
          bestOpportunityProfitUsd: 27.45,
          averageConfidence: 0.88,
          profitTrend: [],
          topStrategies: [],
          gasCostTrend: [],
          recentTrades: [],
          chains: [
            {
              chainId: 1,
              liveOpportunitiesCount: 1,
            },
          ],
          lastOpportunityAt: '2026-03-22T12:00:00.000Z',
        },
      },
    });
  });
});
