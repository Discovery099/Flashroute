import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis-mock';
import { TradeQueueProcessor } from './trade-queue.processor';
import { TradeApiClient } from './trade-api.client';
import { REDIS_CHANNELS } from '@flashroute/shared';

vi.mock('./trade-api.client');

describe('TradeQueueProcessor Integration', () => {
  let redis: InstanceType<typeof Redis>;
  let mockApiClient: TradeApiClient;
  let processor: TradeQueueProcessor;
  let publishMock: ReturnType<typeof vi.fn>;
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    redis = new Redis();
    publishMock = vi.fn().mockResolvedValue(1);
    redis.publish = publishMock;
    mockApiClient = {
      createTrade: vi.fn(),
      updateTradeStatus: vi.fn(),
    } as unknown as TradeApiClient;
    processor = new TradeQueueProcessor(redis as never, mockApiClient, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    redis.disconnect();
  });

  describe('create trade flow', () => {
    it('full flow: publish to queue -> processMessage -> apiClient.createTrade -> redis.publish', async () => {
      const tradePayload = { strategyId: 'strat-1', status: 'pending', chainId: 1, profitUsd: 10.5 };
      const message = JSON.stringify({ type: 'create', payload: tradePayload });

      vi.mocked(mockApiClient.createTrade).mockResolvedValue({ id: 'trade-123' });

      await redis.lpush(REDIS_CHANNELS.tradesQueue, message);

      const queuedMessages = await redis.lrange(REDIS_CHANNELS.tradesQueue, 0, -1);
      expect(queuedMessages).toContain(message);

      await processor['processMessage'](message);

      expect(mockApiClient.createTrade).toHaveBeenCalledWith(tradePayload);
      expect(publishMock).toHaveBeenCalledWith(
        REDIS_CHANNELS.tradesLive,
        expect.stringContaining('"tradeId":"trade-123"')
      );
      expect(publishMock).toHaveBeenCalledWith(
        REDIS_CHANNELS.tradesLive,
        expect.stringContaining('"event":"trade_update"')
      );
    });
  });

  describe('update trade flow', () => {
    it('full flow: publish to queue -> processMessage -> apiClient.updateTradeStatus -> redis.publish', async () => {
      const updatePayload = { status: 'included', chainId: 1, profitUsd: 15.0 };
      const message = JSON.stringify({ type: 'update', tradeId: 'trade-456', payload: updatePayload });

      vi.mocked(mockApiClient.updateTradeStatus).mockResolvedValue(undefined);

      await redis.lpush(REDIS_CHANNELS.tradesQueue, message);

      const queuedMessages = await redis.lrange(REDIS_CHANNELS.tradesQueue, 0, -1);
      expect(queuedMessages).toContain(message);

      await processor['processMessage'](message);

      expect(mockApiClient.updateTradeStatus).toHaveBeenCalledWith('trade-456', updatePayload);
      expect(publishMock).toHaveBeenCalledWith(
        REDIS_CHANNELS.tradesLive,
        expect.stringContaining('"tradeId":"trade-456"')
      );
      expect(publishMock).toHaveBeenCalledWith(
        REDIS_CHANNELS.tradesLive,
        expect.stringContaining('"status":"included"')
      );
    });
  });
});
