import axios, { AxiosInstance } from 'axios';

export class TradeApiClient {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({ baseURL: baseUrl });
  }

  async createTrade(payload: Record<string, unknown>): Promise<{ id: string }> {
    const response = await this.client.post('/internal/trades', payload);
    return { id: response.data.trade.id };
  }

  async updateTradeStatus(
    tradeId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.client.patch(`/internal/trades/${tradeId}/status`, payload);
  }
}