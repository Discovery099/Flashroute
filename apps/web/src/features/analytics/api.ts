import { useQuery } from '@tanstack/react-query';

const API_BASE = '/api/v1';

export interface AnalyticsOverviewData {
  profitTrend: Array<{ date: string; cumulativeProfitUsd: number }>;
  volumeTrend: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
  successRateTrend: Array<{ date: string; successRate: number }>;
  dailyBreakdown: Array<{
    date: string; grossProfitUsd: number; gasCostUsd: number;
    netProfitUsd: number; tradeCount: number;
  }>;
}

export interface RouteAnalytics {
  routeKey: string; dexes: string; executionCount: number; successCount: number;
  totalProfitUsd: number; avgProfitUsd: number; avgSlippagePct: number;
  avgExecutionTimeMs: number; lastExecutedAt: string;
}

export interface CompetitorData {
  botAddress: string; tradeCount: number; estimatedProfitUsd: number;
  avgGasPriceGwei: number; mostUsedRoutes: string[];
  firstSeenAt: string; lastSeenAt: string;
}

export interface GasAnalytics {
  currentBaseFeeGwei: number | null; avgBaseFee24h: number | null; avgPriorityFee24h: number | null;
  ourAvgGasCost: number | null; gasSpentTotalUsd: number | null;
  gasSavedByFlashbotsUsd: number | null; optimalExecutionHours: number[] | null;
  gasTrend: Array<{ hour: string; avgBaseFeeGwei: number | null; avgPriorityFeeGwei: number | null }>;
}

const buildParams = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, String(v)); });
  return p.toString();
};

export const useAnalyticsOverview = (params: { period?: string; chainId?: number }) =>
  useQuery<{ success: true; data: AnalyticsOverviewData }>({
    queryKey: ['analytics-overview', params],
    queryFn: () => fetch(`${API_BASE}/analytics/overview?${buildParams(params)}`).then((r) => { if (!r.ok) throw new Error('API error'); return r.json(); }) as Promise<{ success: true; data: AnalyticsOverviewData }>,
  });

export const useAnalyticsRoutes = (params: { period?: string; chainId?: number; limit?: number }) =>
  useQuery<{ success: true; data: { routes: RouteAnalytics[] } }>({
    queryKey: ['analytics-routes', params],
    queryFn: () => fetch(`${API_BASE}/analytics/routes?${buildParams(params)}`).then((r) => { if (!r.ok) throw new Error('API error'); return r.json(); }) as Promise<{ success: true; data: { routes: RouteAnalytics[] } }>,
  });

export const useAnalyticsCompetitors = (params: { chainId?: number; limit?: number }) =>
  useQuery<{ success: true; data: { competitors: CompetitorData[]; totalCompetitorTrades: number; ourWinRate: number | null } }>({
    queryKey: ['analytics-competitors', params],
    queryFn: () => fetch(`${API_BASE}/analytics/competitors?${buildParams(params)}`).then((r) => { if (!r.ok) throw new Error('API error'); return r.json(); }) as Promise<{ success: true; data: { competitors: CompetitorData[]; totalCompetitorTrades: number; ourWinRate: number | null } }>,
  });

export const useAnalyticsGas = (params: { period?: string; chainId?: number }) =>
  useQuery<{ success: true; data: { gas: GasAnalytics } }>({
    queryKey: ['analytics-gas', params],
    queryFn: () => fetch(`${API_BASE}/analytics/gas?${buildParams(params)}`).then((r) => { if (!r.ok) throw new Error('API error'); return r.json(); }) as Promise<{ success: true; data: { gas: GasAnalytics } }>,
  });
