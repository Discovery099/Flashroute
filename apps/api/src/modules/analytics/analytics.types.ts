export const PERIOD_VALUES = ['7d', '30d', '90d', 'all'] as const;
export type Period = typeof PERIOD_VALUES[number];
export const CHAIN_IDS = [1, 42161, 10, 137] as const;

export interface AnalyticsOverviewData {
  profitTrend: Array<{ date: string; cumulativeProfitUsd: number }>;
  volumeTrend: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
  successRateTrend: Array<{ date: string; successRate: number }>;
  dailyBreakdown: Array<{
    date: string;
    grossProfitUsd: number;
    gasCostUsd: number;
    netProfitUsd: number;
    tradeCount: number;
  }>;
}

export interface RouteAnalytics {
  routeKey: string;
  dexes: string;
  executionCount: number;
  successCount: number;
  totalProfitUsd: number;
  avgProfitUsd: number;
  avgSlippagePct: number;
  avgExecutionTimeMs: number;
  lastExecutedAt: string;
}

export interface CompetitorData {
  botAddress: string;
  tradeCount: number;
  estimatedProfitUsd: number;
  avgGasPriceGwei: number;
  mostUsedRoutes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface GasAnalytics {
  currentBaseFeeGwei: number | null;
  avgBaseFee24h: null;        // requires Phase G
  avgPriorityFee24h: null;    // requires Phase G
  ourAvgGasCost: number | null;
  gasSpentTotalUsd: number | null;
  gasSavedByFlashbotsUsd: null; // requires Phase G
  optimalExecutionHours: null;  // requires Phase G
  gasTrend: Array<{ hour: string; avgBaseFeeGwei: number | null; avgPriorityFeeGwei: number | null }>;
}
