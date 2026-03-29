import axios, { AxiosInstance, isAxiosError } from 'axios';

const INTERNAL_TRADES_PATH = '/internal/trades';

export class TradeApiClient {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({ baseURL: baseUrl });
  }

  async createTrade(payload: Record<string, unknown>): Promise<{ id: string }> {
    try {
      const response = await this.client.post(INTERNAL_TRADES_PATH, payload);
      return { id: response.data.trade.id };
    } catch (err) {
      if (isAxiosError(err)) {
        throw new Error(`TradeApiClient.createTrade failed: ${err.message}`);
      }
      throw err;
    }
  }

  async updateTradeStatus(
    tradeId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.client.patch(`${INTERNAL_TRADES_PATH}/${tradeId}/status`, payload);
    } catch (err) {
      if (isAxiosError(err)) {
        throw new Error(`TradeApiClient.updateTradeStatus(${tradeId}) failed: ${err.message}`);
      }
      throw err;
    }
  }
}