import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeQueueProcessor } from './trade-queue.processor';
import { TradeApiClient } from './trade-api.client';

const mockPublish = vi.fn();
const mockBrpop = vi.fn();
const mockLpush = vi.fn();

vi.mock('./trade-api.client');

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    brpop: mockBrpop,
    publish: mockPublish,
    lpush: mockLpush,
  })),
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

describe('TradeQueueProcessor', () => {
  let processor: TradeQueueProcessor;
  let mockApiClient: TradeApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient = {
      createTrade: vi.fn(),
      updateTradeStatus: vi.fn(),
    } as unknown as TradeApiClient;
    processor = new TradeQueueProcessor(
      { brpop: mockBrpop, publish: mockPublish, lpush: mockLpush } as never,
      mockApiClient,
      mockLogger
    );
  });

  describe('processMessage', () => {
    it('processes create message — calls apiClient.createTrade and redis.publish', async () => {
      const message = JSON.stringify({
        type: 'create',
        payload: { strategyId: 'strat-1', status: 'pending' },
      });
      vi.mocked(mockApiClient.createTrade).mockResolvedValue({ id: 'trade-123' });
      mockPublish.mockResolvedValue(1);

      await processor['processMessage'](message);

      expect(mockApiClient.createTrade).toHaveBeenCalledWith({
        strategyId: 'strat-1',
        status: 'pending',
      });
      expect(mockPublish).toHaveBeenCalledWith(
        'fr:trades:live',
        expect.stringContaining('"tradeId":"trade-123"')
      );
    });

    it('processes update message — calls apiClient.updateTradeStatus and redis.publish', async () => {
      const message = JSON.stringify({
        type: 'update',
        tradeId: 'trade-456',
        payload: { status: 'included' },
      });
      mockPublish.mockResolvedValue(1);

      await processor['processMessage'](message);

      expect(mockApiClient.updateTradeStatus).toHaveBeenCalledWith('trade-456', {
        status: 'included',
      });
      expect(mockPublish).toHaveBeenCalledWith(
        'fr:trades:live',
        expect.stringContaining('"tradeId":"trade-456"')
      );
    });

    it('parse error — logs warning, does not call API', async () => {
      await processor['processMessage']('invalid json');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { message: 'invalid json' },
        expect.stringContaining('Failed to parse')
      );
      expect(mockApiClient.createTrade).not.toHaveBeenCalled();
      expect(mockApiClient.updateTradeStatus).not.toHaveBeenCalled();
    });

    it('API error on create — re-queues message via lpush', async () => {
      const message = JSON.stringify({
        type: 'create',
        payload: { strategyId: 'strat-1' },
      });
      vi.mocked(mockApiClient.createTrade).mockRejectedValue(new Error('API failure'));

      await processor['processMessage'](message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), message: expect.anything() },
        expect.stringContaining('re-queuing')
      );
      expect(mockLpush).toHaveBeenCalledWith('fr:trades:queue', message);
    });

    it('API error on update — re-queues message via lpush', async () => {
      const message = JSON.stringify({
        type: 'update',
        tradeId: 'trade-456',
        payload: { status: 'included' },
      });
      vi.mocked(mockApiClient.updateTradeStatus).mockRejectedValue(new Error('API failure'));

      await processor['processMessage'](message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), message: expect.anything() },
        expect.stringContaining('re-queuing')
      );
      expect(mockLpush).toHaveBeenCalledWith('fr:trades:queue', message);
    });

    it('unknown message type — logs warning and discards', async () => {
      const message = JSON.stringify({ type: 'unknown' });
      await processor['processMessage'](message);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { type: 'unknown' },
        expect.stringContaining('Unknown message type')
      );
      expect(mockApiClient.createTrade).not.toHaveBeenCalled();
      expect(mockApiClient.updateTradeStatus).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('sets running to false', async () => {
      await processor.stop();
      expect(processor['running']).toBe(false);
    });
  });
});