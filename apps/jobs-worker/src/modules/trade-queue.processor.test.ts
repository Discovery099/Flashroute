import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeQueueProcessor } from './trade-queue.processor';
import { TradeApiClient } from './trade-api.client';

vi.mock('./trade-api.client');

const mockPublish = vi.fn();
const mockBrpop = vi.fn();

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    brpop: mockPublish,
    publish: mockPublish,
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
      { brpop: mockBrpop, publish: mockPublish } as never,
      mockApiClient,
      mockLogger
    );
  });

  describe('processMessage', () => {
    it('processMessage create — calls apiClient.createTrade and redis.publish', async () => {
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

    it('processMessage update — calls apiClient.updateTradeStatus and redis.publish', async () => {
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

    it('processMessage parse error — logs warning, does not call API', async () => {
      await processor['processMessage']('invalid json');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { message: 'invalid json' },
        'Failed to parse trade queue message'
      );
      expect(mockApiClient.createTrade).not.toHaveBeenCalled();
      expect(mockApiClient.updateTradeStatus).not.toHaveBeenCalled();
    });

    it('processMessage API error — logs error but does not rethrow', async () => {
      const message = JSON.stringify({
        type: 'create',
        payload: { strategyId: 'strat-1' },
      });
      vi.mocked(mockApiClient.createTrade).mockRejectedValue(new Error('API failure'));

      await processor['processMessage'](message);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), message: expect.anything() },
        'Failed to process trade message'
      );
    });
  });

  describe('stop', () => {
    it('sets running to false', async () => {
      await processor.stop();
      expect(processor['running']).toBe(false);
    });
  });
});
