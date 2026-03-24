import { describe, expect, it } from 'vitest';

import { LiveGateway } from './live.gateway';

class FakeSocket {
  public readonly messages: unknown[] = [];

  send(payload: unknown) {
    this.messages.push(payload);
  }
}

describe('LiveGateway', () => {
  it('removes disconnected sessions from active fanout and supports ping/unsubscribe flow', () => {
    const firstSocket = new FakeSocket();
    const gateway = new LiveGateway({
      verifyToken: (token) =>
        token === 'valid-token'
          ? {
              userId: 'user-1',
              role: 'trader',
            }
          : null,
      now: () => 1_700_000_000_000,
      sessionTtlMs: 60_000,
    });

    const firstConnection = gateway.connect({ token: 'valid-token', socket: firstSocket });
    gateway.handleClientMessage(firstConnection.connectionId, {
      type: 'subscribe',
      channels: ['opportunities:42161'],
    });
    gateway.handleClientMessage(firstConnection.connectionId, { type: 'ping' });

    expect(firstSocket.messages.at(-1)).toMatchObject({ type: 'pong' });

    gateway.disconnect(firstConnection.connectionId);
    gateway.handlePubSubMessage(
      'opportunities:42161',
      JSON.stringify({
        type: 'opportunity',
        data: {
          id: 'opp-dead',
          chainId: 42161,
          routePath: [{ poolAddress: '0xpool', tokenIn: 'WETH', tokenOut: 'USDC', dex: 'uniswap-v3' }],
          estimatedProfitUsd: 1,
          confidenceScore: 0.5,
          flashLoan: { provider: 'balancer', token: 'WETH', amount: '1' },
          gasEstimate: { usd: 0.1, gwei: 0.01 },
          expiresAt: '2026-03-22T12:00:10.000Z',
          expiresInMs: 1000,
          hops: 1,
          demandPrediction: { badge: 'watch', impactedPools: 0, predictedProfitChangeUsd: 0 },
          discoveredAt: '2026-03-22T12:00:00.000Z',
        },
      }),
    );

    expect(firstSocket.messages).not.toContainEqual(
      expect.objectContaining({
        type: 'opportunity',
        data: expect.objectContaining({ id: 'opp-dead' }),
      }),
    );
  });

  it('re-authorizes restored subscriptions on resume when the role changed', () => {
    const firstSocket = new FakeSocket();
    let currentRole: 'trader' | 'monitor' = 'trader';
    const gateway = new LiveGateway({
      verifyToken: (token) =>
        token === 'valid-token'
          ? {
              userId: 'user-1',
              role: currentRole,
            }
          : null,
      now: () => 1_700_000_000_000,
      sessionTtlMs: 60_000,
    });

    const firstConnection = gateway.connect({ token: 'valid-token', socket: firstSocket });
    gateway.handleClientMessage(firstConnection.connectionId, {
      type: 'subscribe',
      channels: ['opportunities:42161'],
    });

    gateway.disconnect(firstConnection.connectionId);
    currentRole = 'monitor';

    const resumedSocket = new FakeSocket();
    gateway.connect({
      token: 'valid-token',
      socket: resumedSocket,
      resumeConnectionId: firstConnection.connectionId,
    });

    expect(resumedSocket.messages[0]).toMatchObject({
      type: 'connected',
      data: {
        resumed: true,
      },
    });
    expect(resumedSocket.messages[1]).toMatchObject({
      type: 'subscribed',
      data: {
        channels: [],
      },
    });
  });

  it('prunes expired resumable sessions so they do not accumulate forever', () => {
    const firstSocket = new FakeSocket();
    const clock = { now: 1_700_000_000_000 };
    const gateway = new LiveGateway({
      verifyToken: (token) =>
        token === 'valid-token'
          ? {
              userId: 'user-1',
              role: 'trader',
            }
          : null,
      now: () => clock.now,
      sessionTtlMs: 50,
    });

    const connection = gateway.connect({ token: 'valid-token', socket: firstSocket });
    gateway.handleClientMessage(connection.connectionId, {
      type: 'subscribe',
      channels: ['opportunities:42161'],
    });
    gateway.disconnect(connection.connectionId);
    expect(gateway.getResumableSessionCount()).toBe(1);

    clock.now += 100;

    const nextSocket = new FakeSocket();
    const nextConnection = gateway.connect({ token: 'valid-token', socket: nextSocket });

    expect(gateway.getResumableSessionCount()).toBe(0);
    expect(nextConnection.connectionId).not.toBe(connection.connectionId);
    expect(() =>
      gateway.connect({
        token: 'valid-token',
        socket: new FakeSocket(),
        resumeConnectionId: connection.connectionId,
      }),
    ).not.toThrow();
  });

  it('preserves resumable connection ids across reconnects for the same user session', () => {
    const firstSocket = new FakeSocket();
    const gateway = new LiveGateway({
      verifyToken: (token) =>
        token === 'valid-token'
          ? {
              userId: 'user-1',
              role: 'trader',
            }
          : null,
      now: () => 1_700_000_000_000,
      sessionTtlMs: 60_000,
    });

    const firstConnection = gateway.connect({ token: 'valid-token', socket: firstSocket });
    gateway.handleClientMessage(firstConnection.connectionId, {
      type: 'subscribe',
      channels: ['opportunities:42161'],
    });
    gateway.disconnect(firstConnection.connectionId);

    const resumedSocket = new FakeSocket();
    const resumedConnection = gateway.connect({
      token: 'valid-token',
      socket: resumedSocket,
      resumeConnectionId: firstConnection.connectionId,
    });

    expect(resumedConnection.connectionId).toBe(firstConnection.connectionId);
    expect(resumedSocket.messages[0]).toMatchObject({
      type: 'connected',
      data: { resumed: true, connectionId: firstConnection.connectionId },
    });
  });

  it('authorizes dashboard monitoring channels for monitor users and fans out trade and alert payloads unchanged', () => {
    const socket = new FakeSocket();
    const gateway = new LiveGateway({
      verifyToken: (token) =>
        token === 'valid-token'
          ? {
              userId: 'user-1',
              role: 'monitor',
            }
          : null,
    });

    const connection = gateway.connect({ token: 'valid-token', socket });
    gateway.handleClientMessage(connection.connectionId, {
      type: 'subscribe',
      channels: ['trades:live', 'system:alerts'],
    });

    gateway.handlePubSubMessage(
      'trades:live',
      JSON.stringify({
        type: 'trade',
        data: {
          id: 'trade-live',
          executedAt: '2026-03-22T12:11:00.000Z',
          route: 'WBTC -> USDC -> WBTC',
          netProfitUsd: 245.12,
          gasCostUsd: 16.22,
          status: 'confirmed',
          txHash: '0xdef',
        },
      }),
    );

    gateway.handlePubSubMessage(
      'system:alerts',
      JSON.stringify({
        type: 'alert',
        data: {
          id: 'alert-1',
          severity: 'warning',
          message: 'Sequencer latency elevated',
          createdAt: '2026-03-22T12:12:00.000Z',
        },
      }),
    );

    expect(socket.messages).toContainEqual(
      expect.objectContaining({
        type: 'subscribed',
        data: { channels: ['trades:live', 'system:alerts'] },
      }),
    );
    expect(socket.messages).toContainEqual(
      expect.objectContaining({
        type: 'trade',
        channel: 'trades:live',
        data: expect.objectContaining({ id: 'trade-live', route: 'WBTC -> USDC -> WBTC' }),
      }),
    );
    expect(socket.messages).toContainEqual(
      expect.objectContaining({
        type: 'alert',
        channel: 'system:alerts',
        data: expect.objectContaining({ id: 'alert-1', severity: 'warning' }),
      }),
    );
  });
});
