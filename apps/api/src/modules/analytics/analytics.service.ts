import type { AnalyticsRepository } from './analytics.repository';

// Shared state: This module-level Map is shared across all service instances.
 // Will be moved to instance property once singleton scope is confirmed.
 const ETH_GAS_PRICE_CACHE: Map<number, { value: number; timestamp: number }> = new Map();
 const ETH_GAS_PRICE_CACHE_TTL_MS = 5000;

export class AnalyticsService {
  public constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly rpcUrl: string,
  ) {}

  public async getOverview(userId: string, query: { chainId?: number; period?: string }) {
    return this.analyticsRepository.getOverview(userId, query);
  }

  public async getRoutes(userId: string, query: { chainId?: number; period?: string; strategyId?: string; limit?: number }) {
    return this.analyticsRepository.getRoutes(userId, { ...query, limit: query.limit ?? 20 });
  }

  public async getCompetitors(query: { chainId?: number; limit?: number }) {
    return this.analyticsRepository.getCompetitors({ ...query, limit: query.limit ?? 20 });
  }

  public async getGas(userId: string, query: { chainId?: number; period?: string }) {
    const gas = await this.analyticsRepository.getGas(userId, query);
    if (query.chainId) {
      gas.currentBaseFeeGwei = await this.fetchCurrentBaseFee(query.chainId);
    }
    return gas;
  }

  private async fetchCurrentBaseFee(chainId: number): Promise<number | null> {
    const cached = ETH_GAS_PRICE_CACHE.get(chainId);
    if (cached && Date.now() - cached.timestamp < ETH_GAS_PRICE_CACHE_TTL_MS) {
      return cached.value;
    }
    try {
      const rpcUrl = this.rpcUrl ?? 'https://eth.llamarpc.com';
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        }),
      });
      let gwei: number;
      try {
        const data = (await response.json()) as { result: string };
        gwei = Number(data.result) / 1e9;
      } catch {
        return null;
      }
      ETH_GAS_PRICE_CACHE.set(chainId, { value: gwei, timestamp: Date.now() });
      return gwei;
    } catch {
      return null;
    }
  }
}
