import { apiDelete, apiGet, apiPatch, apiPost, type ApiRequestError } from '@/lib/api';

export type StrategyRecord = {
  id: string;
  name: string;
  description?: string;
  chainId: number;
  isActive: boolean;
  minProfitUsd: number;
  maxTradeSizeUsd?: number;
  maxHops: number;
  cooldownSeconds?: number;
  riskBufferPct: number;
  maxGasPriceGwei?: number;
  maxSlippageBps: number;
  allowedDexes: string[];
  flashLoanProvider: string;
  useFlashbots?: boolean;
  useDemandPrediction?: boolean;
  executionCount: number;
  totalProfitUsd: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type StrategyFormInput = {
  name: string;
  description?: string;
  chainId: number;
  minProfitUsd: number;
  maxTradeSizeUsd?: number;
  maxHops: number;
  cooldownSeconds?: number;
  riskBufferPct: number;
  maxGasPriceGwei?: number;
  maxSlippageBps: number;
  allowedDexes: string[];
  flashLoanProvider?: string;
  useFlashbots?: boolean;
  useDemandPrediction?: boolean;
};

export type StrategyListResponse = {
  strategies: StrategyRecord[];
};

export type StrategyDetailResponse = {
  strategy: StrategyRecord;
  performance: {
    executionCount: number;
    totalProfitUsd: number;
    successRate: number;
    averageProfitUsd: number;
    bestTradeUsd: number;
  };
};

export type StrategyFilters = {
  page?: number;
  limit?: number;
  chainId?: number;
  status?: 'all' | 'active' | 'paused' | 'draft';
  search?: string;
};

const toQueryString = (filters: StrategyFilters) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  return params.toString();
};

export const getStrategies = (filters: StrategyFilters) => {
  const query = toQueryString(filters);
  return apiGet<StrategyListResponse>(`/api/v1/strategies${query ? `?${query}` : ''}`);
};

export const getStrategy = (strategyId: string) => apiGet<StrategyDetailResponse>(`/api/v1/strategies/${strategyId}`);
export const createStrategy = (input: StrategyFormInput) => apiPost<{ strategy: StrategyRecord }>('/api/v1/strategies', input);
export const updateStrategy = (strategyId: string, input: StrategyFormInput) => apiPatch<{ strategy: StrategyRecord }>(`/api/v1/strategies/${strategyId}`, input);
export const activateStrategy = (strategyId: string) => apiPost<{ strategy: StrategyRecord }>(`/api/v1/strategies/${strategyId}/activate`);
export const deactivateStrategy = (strategyId: string) => apiPost<{ strategy: StrategyRecord }>(`/api/v1/strategies/${strategyId}/deactivate`);
export const deleteStrategy = (strategyId: string) => apiDelete<{ message: string }>(`/api/v1/strategies/${strategyId}?confirm=true`);

export const getStrategyFieldErrors = (error: unknown) => {
  if (error && typeof error === 'object' && 'fieldErrors' in error) {
    return (error as ApiRequestError & { fieldErrors: Record<string, string> }).fieldErrors;
  }

  return {} as Record<string, string>;
};
