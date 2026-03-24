import { useQuery } from '@tanstack/react-query';

const API_BASE = '/api/v1';

export interface Trade {
  id: string;
  chainId: number;
  chainName?: string | null;
  strategyId: string;
  strategyName?: string | null;
  status: string;
  txHash: string;
  blockNumber: number | null;
  routePath: Array<{ tokenIn?: string; tokenOut?: string }>;
  routeHops: Array<{ tokenIn?: string; tokenOut?: string }>;
  flashLoanProvider?: string | null;
  flashLoanToken: string;
  flashLoanAmount: string;
  flashLoanFee?: string | null;
  profitRaw?: string | null;
  profitUsd: number;
  gasUsed: number | null;
  gasPriceGwei?: string | null;
  gasCostUsd: number;
  netProfitUsd: number;
  simulatedProfitUsd?: number | null;
  slippagePct?: number | null;
  slippageBps?: number | null;
  demandPredictionUsed?: boolean | null;
  competingTxsInBlock?: number | null;
  errorMessage?: string | null;
  executionTimeMs?: number | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
}

export interface TradeHop {
  id: string;
  tradeId: string;
  hopIndex: number;
  poolId?: string;
  tokenInId?: string;
  tokenOutId?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  expectedAmountOut?: string;
  slippagePct?: number;
  pool?: string;
  dex?: string;
  createdAt: string;
}

export interface ListTradesQuery {
  chainId?: number;
  strategyId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  minProfitUsd?: number;
  sortBy?: 'createdAt' | 'netProfitUsd' | 'gasUsed';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TradeSummaryQuery {
  chainId?: number;
  strategyId?: string;
  startDate?: string;
  endDate?: string;
}

const buildSearchParams = (query: ListTradesQuery): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null) params.set(k, String(v)); });
  return params.toString();
};

export interface TradesResponse {
  success: boolean;
  data: {
    trades: Trade[];
    meta: { page: number; limit: number; total: number };
  };
}

export const useTrades = (query: ListTradesQuery) =>
  useQuery<TradesResponse>({
    queryKey: ['trades', query],
    queryFn: () => fetch(`${API_BASE}/trades?${buildSearchParams(query)}`).then((r) => r.json()),
  });

export interface TradeDetailResponse {
  success: boolean;
  data: {
    trade: Trade;
    hops: TradeHop[];
  };
}

export interface TradeHop {
  id: string;
  tradeId: string;
  stepIndex: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  profitUsd: number;
  gasUsed: number;
}

export const useTrade = (id: string) =>
  useQuery<TradeDetailResponse>({
    queryKey: ['trade', id],
    queryFn: () => fetch(`${API_BASE}/trades/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

export const useTradesSummary = (query: TradeSummaryQuery) =>
  useQuery({
    queryKey: ['trades-summary', query],
    queryFn: () => fetch(`${API_BASE}/trades/summary?${new URLSearchParams(query as any)}`).then((r) => r.json()),
  });
