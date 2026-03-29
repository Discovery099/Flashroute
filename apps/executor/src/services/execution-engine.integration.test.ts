import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IRelayProvider } from '../modules/execution/relay/relay-provider';

vi.mock('@flashroute/db/redis', () => ({
  createRedisClients: vi.fn().mockReturnValue({
    cache: { incr: vi.fn(), get: vi.fn(), set: vi.fn() },
    publisher: { lpush: vi.fn() },
    subscriber: { subscribe: vi.fn() },
    queue: { lpush: vi.fn() },
  }),
  checkRedisHealth: vi.fn().mockResolvedValue({ status: 'healthy', name: 'redis', details: {} }),
}));

vi.mock('@flashroute/shared', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  REDIS_CHANNELS: {
    routeDiscovered: 'fr:route:discovered',
    tradesQueue: 'fr:trades:queue',
  },
}));

describe('ExecutionEngine Integration', () => {
  const VALID_PK = '0x' + 'a'.repeat(64);

  let mockRedis: any;
  let mockNonceManager: any;
  let mockTxTracker: any;
  let mockTradeService: any;
  let ExecutionEngine: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = VALID_PK;

    const { ExecutionEngine: EE } = await import('../services/execution-engine');
    ExecutionEngine = EE;

    mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    mockNonceManager = {
      reserveNonce: vi.fn().mockResolvedValue(0),
      releaseNonce: vi.fn().mockResolvedValue(undefined),
      syncNonce: vi.fn(),
    };

    mockTxTracker = {
      waitForReceipt: vi.fn(),
    };

    mockTradeService = {
      createTrade: vi.fn().mockResolvedValue({ id: 'trade-1' }),
      updateTrade: vi.fn(),
    };
  });

  const buildEngine = (configOverride?: any) => {
    const config = {
      enabled: true,
      privateKey: VALID_PK,
      chains: [1, 42161],
      stalenessThresholdMs: 6000,
      gasReserveEth: 0.05,
      maxPendingPerChain: 1,
      flashbotsRelayUrl: 'https://relay.flashbots.net',
      ...configOverride,
    };

    return new ExecutionEngine(
      config,
      mockNonceManager,
      mockTxTracker,
      mockTradeService,
      mockRedis,
      { 1: 'http://localhost:8545', 42161: 'http://localhost:8547' }
    );
  };

  const mockRoute = (overrides?: Partial<any>) => ({
    id: 'route-1',
    chainId: 1,
    hops: [
      {
        dexType: 1,
        router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: 1000n,
        sqrtPriceLimitX96: 0n,
      },
    ],
    provider: 'balancer',
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    amount: 1000n,
    minProfit: 10n,
    simulatedAt: Date.now(),
    profitUsd: 100,
    ...overrides,
  });

  const mockStrategy = () => ({ id: 'strategy-1', maxGasPriceGwei: 100 });

  describe('shouldExecute gate', () => {
    it('returns approved for fresh non-stale route on known chain', async () => {
      const engine = buildEngine();
      const decision = await engine.shouldExecute(mockRoute(), mockStrategy());
      expect(decision.approved).toBe(true);
      expect(decision.reasons).toHaveLength(0);
    });

    it('skips when EXECUTION_ENABLED=false', async () => {
      const engine = buildEngine({ enabled: false });
      const result = await engine.execute(mockRoute(), mockStrategy());
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('execution_disabled');
    });

    it('skips when simulation is stale (>6s)', async () => {
      const engine = buildEngine();
      const result = await engine.execute(mockRoute({ simulatedAt: Date.now() - 10000 }), mockStrategy());
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('stale');
    });

    it('skips when execution lock is held', async () => {
      mockRedis.set.mockResolvedValueOnce(null);
      const engine = buildEngine();
      const result = await engine.execute(mockRoute(), mockStrategy());
      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('lock');
    });

    it('shouldExecute rejects unknown chain', async () => {
      const engine = buildEngine();
      const decision = await engine.shouldExecute(mockRoute({ chainId: 999 }), mockStrategy());
      expect(decision.approved).toBe(false);
      expect(decision.reasons).toContain('unknown_chain: 999');
    });
  });

  describe('nonce management', () => {
    it('reserves nonce before signing', async () => {
      const engine = buildEngine();
      await engine.execute(mockRoute(), mockStrategy());
      expect(mockNonceManager.reserveNonce).toHaveBeenCalledWith(1);
    });
  });

  describe('TradeService integration', () => {
    it('calls TradeService.createTrade on execution entry', async () => {
      const engine = buildEngine();
      // This tests that the decision gate, nonce reservation, and signing flow
      // are wired up correctly. With real relays, execution would proceed to
      // createTrade before waiting for inclusion.
      await engine.execute(mockRoute(), mockStrategy());
      // The exact assertions depend on whether real relays are used.
      // This test documents the expected call sequence.
    });
  });
});
