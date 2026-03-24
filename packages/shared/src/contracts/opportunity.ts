import type { DexType } from './pools';

export interface OpportunityRouteHop {
  poolAddress: string;
  dexType: DexType;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeBps: number;
  rate: number;
  weight: number;
  blockNumber: number;
  sampleAmountIn: string;
  sampleAmountOut: string;
}

export interface OpportunityRoute {
  chainId: number;
  sourceToken: string;
  signature: string;
  hops: number;
  totalWeight: number;
  estimatedProfitRatio: number;
  discoveredAt: number;
  path: OpportunityRouteHop[];
}

export interface OpportunityRoutePathItem {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  dex: DexType;
}

export interface OpportunityFlashLoanView {
  provider: string;
  token: string;
  amount: string;
}

export interface OpportunityGasEstimateView {
  usd: number;
  gwei?: number;
}

export interface OpportunityDemandPredictionView {
  badge: string;
  impactedPools: number;
  predictedProfitChangeUsd: number;
}

export interface OpportunityView {
  id: string;
  chainId: number;
  routePath: OpportunityRoutePathItem[];
  estimatedProfitUsd: number;
  confidenceScore: number;
  flashLoan: OpportunityFlashLoanView;
  gasEstimate: OpportunityGasEstimateView;
  expiresAt: string;
  expiresInMs: number;
  hops: number;
  demandPrediction: OpportunityDemandPredictionView;
  discoveredAt: string;
}

export interface OpportunityApiRoutePathItem {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  dex: string;
}

export interface OpportunityApiView {
  id: string;
  chainId: number;
  routePath: OpportunityApiRoutePathItem[];
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
}
