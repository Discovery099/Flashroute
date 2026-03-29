import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionEngine } from './execution-engine';

vi.mock('@flashroute/db/redis', () => ({
  createRedisClients: vi.fn(),
  checkRedisHealth: vi.fn(),
}));

describe('ExecutionEngine', () => {
  let mockConfig: any;
  let mockNonceManager: any;
  let mockTxTracker: any;
  let mockTradeQueuePublisher: any;
  let mockRedis: any;
  let engine: ExecutionEngine;

  const mockRoute = {
    id: 'route-1',
    chainId: 1,
    hops: [{ dexType: 1, router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', amountIn: 1000n, sqrtPriceLimitX96: 0n }],
    provider: 'balancer',
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    amount: 1000n,
    minProfit: 0n,
    simulatedAt: Date.now(),
  };

  const mockStrategy = { id: 'strategy-1' };

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      privateKey: '0x' + 'a'.repeat(64),
      chains: [1],
      stalenessThresholdMs: 6000,
      flashbotsRelayUrl: 'https://relay.flashbots.net',
    };

    mockNonceManager = {
      reserveNonce: vi.fn().mockResolvedValue(0),
      releaseNonce: vi.fn(),
    };

    mockTxTracker = {
      waitForReceipt: vi.fn(),
    };

    mockTradeQueuePublisher = {
      publishCreateTrade: vi.fn().mockResolvedValue('trade-1'),
      publishUpdateTrade: vi.fn(),
    };

    mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    engine = new ExecutionEngine(
      mockConfig,
      mockNonceManager,
      mockTxTracker,
      mockTradeQueuePublisher,
      mockRedis,
      { 1: 'https://eth.llamarpc.com' }
    );
  });

  it('skips when EXECUTION_ENABLED=false', async () => {
    mockConfig.enabled = false;
    const eng = new ExecutionEngine(mockConfig, mockNonceManager, mockTxTracker, mockTradeQueuePublisher, mockRedis, { 1: 'https://eth.llamarpc.com' });
    const result = await eng.execute(mockRoute as any, mockStrategy as any);
    expect(result.status).toBe('skipped');
  });

  it('skips when simulation is stale', async () => {
    const staleRoute = { ...mockRoute, simulatedAt: Date.now() - 100_000 };
    const result = await engine.execute(staleRoute as any, mockStrategy as any);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('stale_opportunity');
  });

  it('skips when lock cannot be acquired', async () => {
    mockRedis.set = vi.fn().mockResolvedValue(null);
    const result = await engine.execute(mockRoute as any, mockStrategy as any);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('lock');
  });

  it('releases nonce on submission failure', async () => {
    mockNonceManager.reserveNonce = vi.fn().mockRejectedValue(new Error('nonce error'));
    await engine.execute(mockRoute as any, mockStrategy as any);
    expect(mockNonceManager.releaseNonce).not.toHaveBeenCalled();
  });
});
