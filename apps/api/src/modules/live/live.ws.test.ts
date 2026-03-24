import { afterEach, describe, expect, it } from 'vitest';

import { createTestApiHarness } from '../../test/test-harness';

const TEST_PASSWORD = 'StrongPass1!';

const waitForMessages = async (messages: unknown[], count: number) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (messages.length >= count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

afterEach(async (context) => {
  const app = (context as { app?: Awaited<ReturnType<typeof createTestApiHarness>>['app'] }).app;

  await app?.close();
});

describe('/ws endpoint', () => {
  it('authenticates with token, subscribes, receives redis fanout, and supports unsubscribe', async (context) => {
    const harness = await createTestApiHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'live@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Live User',
      },
    });
    const user = harness.getUserByEmail('live@flashroute.test')!;
    harness.setUserRole(user.id, 'trader');
    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'live@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    await harness.app.listen({ port: 0, host: '127.0.0.1' });
    const address = harness.app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${login.json().data.accessToken as string}`);
    const messages: unknown[] = [];
    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)));
    });

    await new Promise<void>((resolve) => socket.addEventListener('open', () => resolve(), { once: true }));
    await waitForMessages(messages, 1);

    socket.send(JSON.stringify({ type: 'subscribe', channels: ['opportunities:42161'] }));
    await waitForMessages(messages, 2);

    await harness.publishOpportunityUpdate(42161, {
      id: 'opp-live',
      chainId: 42161,
      routePath: [{ poolAddress: '0xpool', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap-v3' }],
      estimatedProfitUsd: 31.77,
      confidenceScore: 0.84,
      flashLoan: { provider: 'balancer', token: 'WETH', amount: '10' },
      gasEstimate: { usd: 4.12, gwei: 0.09 },
      expiresAt: '2026-03-22T12:00:12.000Z',
      expiresInMs: 12_000,
      demandPrediction: { badge: 'watch', impactedPools: 1, predictedProfitChangeUsd: -1.2 },
      discoveredAt: '2026-03-22T12:00:00.000Z',
      hops: 1,
    });
    await waitForMessages(messages, 3);

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'subscribed',
        data: { channels: ['opportunities:42161'] },
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'opportunity',
        channel: 'opportunities:42161',
        data: expect.objectContaining({
          id: 'opp-live',
          estimatedProfitUsd: 31.77,
          flashLoanToken: 'WETH',
          gasEstimateGwei: 0.09,
        }),
      }),
    );

    socket.send(JSON.stringify({ type: 'unsubscribe', channels: ['opportunities:42161'] }));
    await waitForMessages(messages, 4);
    await harness.publishOpportunityUpdate(42161, {
      id: 'opp-after-unsub',
      chainId: 42161,
      routePath: [{ poolAddress: '0xpool', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap-v3' }],
      estimatedProfitUsd: 15,
      confidenceScore: 0.5,
      flashLoan: { provider: 'balancer', token: 'WETH', amount: '5' },
      gasEstimate: { usd: 1, gwei: 0.01 },
      expiresAt: '2026-03-22T12:00:20.000Z',
      expiresInMs: 20_000,
      demandPrediction: { badge: 'watch', impactedPools: 0, predictedProfitChangeUsd: 0 },
      discoveredAt: '2026-03-22T12:00:01.000Z',
      hops: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(messages).not.toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'opp-after-unsub' }),
      }),
    );

    socket.close();
    await new Promise<void>((resolve) => socket.addEventListener('close', () => resolve(), { once: true }));
  }, 30000);

  it('supports dashboard monitoring channel subscriptions for trades and alerts', async (context) => {
    const harness = await createTestApiHarness();
    (context as { app?: typeof harness.app }).app = harness.app;

    await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'monitor@flashroute.test',
        password: TEST_PASSWORD,
        name: 'Monitor User',
      },
    });
    const user = harness.getUserByEmail('monitor@flashroute.test')!;
    harness.setUserRole(user.id, 'monitor');
    const login = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'monitor@flashroute.test',
        password: TEST_PASSWORD,
      },
    });

    await harness.app.listen({ port: 0, host: '127.0.0.1' });
    const address = harness.app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${login.json().data.accessToken as string}`);
    const messages: unknown[] = [];
    socket.addEventListener('message', (event) => {
      messages.push(JSON.parse(String(event.data)));
    });

    await new Promise<void>((resolve) => socket.addEventListener('open', () => resolve(), { once: true }));
    await waitForMessages(messages, 1);

    socket.send(JSON.stringify({ type: 'subscribe', channels: ['trades:live', 'system:alerts'] }));
    await waitForMessages(messages, 2);

    await harness.publishTradeLive({
      id: 'trade-live',
      executedAt: '2026-03-22T12:11:00.000Z',
      route: 'WBTC -> USDC -> WBTC',
      netProfitUsd: 245.12,
      gasCostUsd: 16.22,
      status: 'confirmed',
      txHash: '0xdef',
    });
    await harness.publishSystemAlert({
      id: 'alert-1',
      severity: 'warning',
      message: 'Sequencer latency elevated',
      createdAt: '2026-03-22T12:12:00.000Z',
    });
    await waitForMessages(messages, 4);

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'subscribed',
        data: { channels: ['trades:live', 'system:alerts'] },
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'trade',
        channel: 'trades:live',
        data: expect.objectContaining({ id: 'trade-live', route: 'WBTC -> USDC -> WBTC' }),
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'alert',
        channel: 'system:alerts',
        data: expect.objectContaining({ id: 'alert-1', severity: 'warning' }),
      }),
    );

    socket.close();
    await new Promise<void>((resolve) => socket.addEventListener('close', () => resolve(), { once: true }));
  }, 30000);
});
