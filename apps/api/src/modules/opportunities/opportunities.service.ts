import type { OpportunityView } from '@flashroute/shared/contracts/opportunity';

export interface OpportunitiesCacheClient {
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number, rev?: 'REV'): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export interface OpportunitiesRepository {
  list(chainId: number): Promise<OpportunityView[]>;
  remove(chainId: number, opportunityIds: string[]): Promise<void>;
  listChainIds(): Promise<number[]>;
  save(opportunity: OpportunityView): Promise<void>;
}

export interface OpportunitiesQuery {
  chainId: number;
  minProfitUsd: number;
  maxHops: number;
  limit: number;
}

export interface OpportunitiesResult {
  opportunities: OpportunityView[];
  meta: {
    limit: number;
    total: number;
  };
}

export interface DashboardPeriodShell {
  period: '7d' | '30d' | '90d' | 'all';
  totalProfitUsd: number;
  todayProfitUsd: number;
  totalTrades: number;
  successRate: number;
  activeStrategies: number;
  liveOpportunitiesCount: number;
  bestOpportunityProfitUsd: number;
  averageConfidence: number;
  profitTrend: Array<{ date: string; profit: number }>;
  topStrategies: Array<{ id: string; name: string; profit: number; trades: number }>;
  gasCostTrend: Array<{ date: string; cost: number }>;
  recentTrades: Array<unknown>;
  chains: Array<{ chainId: number; liveOpportunitiesCount: number }>;
  lastOpportunityAt: string | null;
}

const CHAIN_SET_KEY = 'fr:opportunities:chains';
const opportunityKey = (chainId: number) => `fr:opportunities:${chainId}`;

const compareProfitDesc = (left: OpportunityView, right: OpportunityView) => right.estimatedProfitUsd - left.estimatedProfitUsd;

export class RedisOpportunitiesRepository implements OpportunitiesRepository {
  public constructor(private readonly redis: OpportunitiesCacheClient) {}

  public async list(chainId: number): Promise<OpportunityView[]> {
    return (await this.redis.zrange(opportunityKey(chainId), 0, -1, 'REV')).map((payload) => JSON.parse(payload) as OpportunityView);
  }

  public async remove(chainId: number, opportunityIds: string[]): Promise<void> {
    if (opportunityIds.length === 0) {
      return;
    }

    const records = await this.list(chainId);
    const payloads = records
      .filter((record) => opportunityIds.includes(record.id))
      .map((record) => JSON.stringify(record));

    if (payloads.length > 0) {
      await this.redis.zrem(opportunityKey(chainId), ...payloads);
    }
  }

  public async listChainIds(): Promise<number[]> {
    return (await this.redis.smembers(CHAIN_SET_KEY)).map((value) => Number(value)).filter((value) => Number.isInteger(value));
  }

  public async save(opportunity: OpportunityView): Promise<void> {
    await this.redis.sadd(CHAIN_SET_KEY, String(opportunity.chainId));
    await this.redis.zadd(opportunityKey(opportunity.chainId), opportunity.estimatedProfitUsd, JSON.stringify(opportunity));
  }
}

export class OpportunitiesService {
  public constructor(
    private readonly repository: OpportunitiesRepository,
    private readonly now: () => number = Date.now,
  ) {}

  public async list(query: OpportunitiesQuery): Promise<OpportunitiesResult> {
    const records = (await this.getActiveOpportunities(query.chainId))
      .filter((record) => record.estimatedProfitUsd >= query.minProfitUsd)
      .filter((record) => record.hops <= query.maxHops)
      .sort(compareProfitDesc);

    return {
      opportunities: records.slice(0, query.limit),
      meta: {
        limit: query.limit,
        total: records.length,
      },
    };
  }

  public async getDashboardShell(period: DashboardPeriodShell['period'], chainId?: number): Promise<DashboardPeriodShell> {
    const chainIds = chainId === undefined ? await this.repository.listChainIds() : [chainId];
    const opportunities = (await Promise.all(chainIds.map((id) => this.getActiveOpportunities(id)))).flat();
    const sorted = [...opportunities].sort(compareProfitDesc);
    const averageConfidence =
      opportunities.length === 0
        ? 0
        : Number((opportunities.reduce((sum, opportunity) => sum + opportunity.confidenceScore, 0) / opportunities.length).toFixed(2));

    return {
      period,
      totalProfitUsd: 0,
      todayProfitUsd: 0,
      totalTrades: 0,
      successRate: 0,
      activeStrategies: 0,
      liveOpportunitiesCount: opportunities.length,
      bestOpportunityProfitUsd: sorted[0]?.estimatedProfitUsd ?? 0,
      averageConfidence,
      profitTrend: [],
      topStrategies: [],
      gasCostTrend: [],
      recentTrades: [],
      chains: chainIds.map((id) => ({
        chainId: id,
        liveOpportunitiesCount: opportunities.filter((opportunity) => opportunity.chainId === id).length,
      })),
      lastOpportunityAt:
        opportunities.length === 0
          ? null
          : [...opportunities]
              .sort((left, right) => new Date(right.discoveredAt).getTime() - new Date(left.discoveredAt).getTime())[0]!
              .discoveredAt,
    };
  }

  private async getActiveOpportunities(chainId: number): Promise<OpportunityView[]> {
    const now = this.now();
    const records = await this.repository.list(chainId);
    const expiredIds = records
      .filter((record) => new Date(record.expiresAt).getTime() <= now || record.expiresInMs <= 0)
      .map((record) => record.id);

    if (expiredIds.length > 0) {
      await this.repository.remove(chainId, expiredIds);
    }

    return records
      .filter((record) => !expiredIds.includes(record.id))
      .map((record) => ({
        ...record,
        hops: record.hops || record.routePath.length,
        expiresInMs: Math.max(0, new Date(record.expiresAt).getTime() - now),
      }));
  }
}
