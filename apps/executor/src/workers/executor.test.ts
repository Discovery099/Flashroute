import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubscribe = vi.fn();
const mockPsubscribe = vi.fn();
const mockQuit = vi.fn().mockResolvedValue(undefined);

vi.mock('../channels/redis-subscriber', () => ({
  RedisSubscriber: vi.fn().mockImplementation(() => ({
    subscribe: mockSubscribe,
    psubscribe: mockPsubscribe,
    close: mockQuit,
  })),
}));

vi.mock('@flashroute/db/redis', () => ({
  createRedisClients: vi.fn(),
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

describe('ExecutorWorker', () => {
  let ExecutorWorker: any;
  let mockConfig: any;
  let mockCacheClient: any;
  let mockExecutionEngine: any;
  let mockRedisClients: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../workers/executor');
    ExecutorWorker = module.ExecutorWorker;

    mockConfig = {
      enabled: true,
      chains: [1],
      stalenessThresholdMs: 6000,
      privateKey: '0x' + 'a'.repeat(64),
      flashbotsRelayUrl: 'https://relay.flashbots.net',
    };

    mockCacheClient = {
      ping: vi.fn().mockResolvedValue('PONG'),
      keys: vi.fn().mockResolvedValue([]),
    };

    mockExecutionEngine = {
      execute: vi.fn(),
      shouldExecute: vi.fn().mockResolvedValue({ approved: true }),
      initialize: vi.fn(),
      getProvider: vi.fn().mockReturnValue({
        getBlockNumber: vi.fn().mockResolvedValue(100),
      }),
    };

    mockRedisClients = {
      publisher: {
        publish: vi.fn().mockResolvedValue(1),
      },
      subscriber: {
        subscribe: vi.fn().mockResolvedValue('OK'),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('subscribes to fr:route:discovered on startup', async () => {
    const worker = new ExecutorWorker(mockConfig, mockCacheClient, mockExecutionEngine, mockRedisClients);
    await worker.start();

    expect(mockSubscribe).toHaveBeenCalledWith(
      'fr:route:discovered',
      expect.any(Function)
    );
  });

  it('logs and skips when EXECUTION_ENABLED=false', async () => {
    mockConfig.enabled = false;
    const worker = new ExecutorWorker(mockConfig, mockCacheClient, mockExecutionEngine, mockRedisClients);

    const route = {
      id: 'route-1',
      chainId: 1,
      hops: [],
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amount: '1000',
      simulatedAt: Date.now(),
    };

    await worker.handleRouteDiscovered(JSON.stringify(route));

    expect(mockExecutionEngine.execute).not.toHaveBeenCalled();
  });

  it('parses and executes valid route messages', async () => {
    const worker = new ExecutorWorker(mockConfig, mockCacheClient, mockExecutionEngine, mockRedisClients);

    mockExecutionEngine.execute.mockResolvedValue({
      status: 'included',
      txHash: '0xtxhash',
      tradeId: 'trade-1',
    });

    const route = {
      id: 'route-1',
      chainId: 1,
      hops: [
        {
          dexType: 1,
          router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
          tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: '1000',
          sqrtPriceLimitX96: '0',
        },
      ],
      provider: 'balancer',
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      amount: '1000',
      simulatedAt: Date.now(),
    };

    await worker.handleRouteDiscovered(JSON.stringify(route));

    expect(mockExecutionEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'route-1' }),
      expect.any(Object)
    );
  });

  it('skips execution when route message is invalid JSON', async () => {
    const worker = new ExecutorWorker(mockConfig, mockCacheClient, mockExecutionEngine, mockRedisClients);

    await worker.handleRouteDiscovered('not valid json');

    expect(mockExecutionEngine.execute).not.toHaveBeenCalled();
  });

  it('stops cleanly', async () => {
    const worker = new ExecutorWorker(mockConfig, mockCacheClient, mockExecutionEngine, mockRedisClients);
    await worker.stop();

    expect(mockQuit).toHaveBeenCalled();
  });
});
