import { apiGet } from '@/lib/api';

export type DashboardPeriod = '7d' | '30d' | '90d';

export type DashboardTrade = {
  id: string;
  executedAt: string;
  route: string;
  netProfitUsd: number;
  gasCostUsd: number;
  status: string;
  txHash: string;
};

export type DashboardData = {
  dashboard: {
    period: DashboardPeriod | 'all';
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
    recentTrades: DashboardTrade[];
    chains: Array<{ chainId: number; liveOpportunitiesCount: number }>;
    lastOpportunityAt: string | null;
  };
};

export const getDashboard = (period: DashboardPeriod, chainId?: number) => {
  const params = new URLSearchParams({ period });
  if (chainId !== undefined) {
    params.set('chainId', String(chainId));
  }
  return apiGet<DashboardData>(`/api/v1/analytics/dashboard?${params.toString()}`);
};
