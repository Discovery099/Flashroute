import { apiGet } from '@/lib/api';

export type OpportunityApiItem = {
  id: string;
  chainId: number;
  routePath: Array<{ pool: string; tokenIn: string; tokenOut: string; dex: string }>;
  hops: number;
  estimatedProfitUsd: number;
  confidenceScore: number;
  flashLoanToken: string;
  flashLoanAmount: string;
  gasEstimateGwei?: number;
  expiresInMs: number;
  demandPrediction: {
    impactedPools: number;
    predictedProfitChange: number;
    badge?: string;
  };
  discoveredAt: string;
};

export type OpportunitiesData = {
  opportunities: OpportunityApiItem[];
};

export type OpportunitiesQuery = {
  chainId: number;
  minProfitUsd: number;
  limit?: number;
};

export const getOpportunities = ({ chainId, limit = 20, minProfitUsd }: OpportunitiesQuery) => {
  const params = new URLSearchParams({
    chainId: String(chainId),
    minProfitUsd: String(minProfitUsd),
    maxHops: '6',
    limit: String(limit),
  });

  return apiGet<OpportunitiesData>(`/api/v1/routes/opportunities?${params.toString()}`);
};
