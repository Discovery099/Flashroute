import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockPost = vi.fn();
const mockPatch = vi.fn();
vi.mocked(axios.create).mockReturnValue({
  post: mockPost,
  patch: mockPatch,
} as never);

import { TradeApiClient } from './trade-api.client';

describe('TradeApiClient', () => {
  let client: TradeApiClient;

  beforeEach(() => {
    client = new TradeApiClient('http://localhost:3000');
    vi.clearAllMocks();
  });

  describe('createTrade', () => {
    it('makes POST request to /internal/trades', async () => {
      mockPost.mockResolvedValue({ data: { trade: { id: 'trade-123' } } });

      await client.createTrade({ strategyId: 'strat-1' });

      expect(mockPost).toHaveBeenCalledWith('/internal/trades', { strategyId: 'strat-1' });
    });

    it('returns trade id from response', async () => {
      mockPost.mockResolvedValue({ data: { trade: { id: 'trade-456' } } });

      const result = await client.createTrade({});

      expect(result).toEqual({ id: 'trade-456' });
    });
  });

  describe('updateTradeStatus', () => {
    it('makes PATCH request to /internal/trades/:id/status', async () => {
      mockPatch.mockResolvedValue({ data: {} });

      await client.updateTradeStatus('trade-789', { newStatus: 'included' });

      expect(mockPatch).toHaveBeenCalledWith('/internal/trades/trade-789/status', {
        newStatus: 'included',
      });
    });

    it('throws on API error', async () => {
      mockPatch.mockRejectedValue(new Error('Network error'));

      await expect(client.updateTradeStatus('trade-123', { newStatus: 'included' })).rejects.toThrow(
        'Network error'
      );
    });
  });
});