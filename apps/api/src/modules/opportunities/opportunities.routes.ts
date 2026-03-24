import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OpportunityApiView, OpportunityView } from '@flashroute/shared/contracts/opportunity';

import { ApiError } from '../../app';
import { canAccessOpportunities } from '../live/live.policy';
import type { OpportunitiesService } from './opportunities.service';

const querySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  minProfitUsd: z.coerce.number().min(0).default(1),
  maxHops: z.coerce.number().int().min(1).max(6).default(4),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const dexNameMap: Record<string, string> = {
  'uniswap-v2': 'uniswap_v2',
  'uniswap-v3': 'uniswap_v3',
};

export const toOpportunityApiView = (opportunity: OpportunityView): OpportunityApiView => ({
  id: opportunity.id,
  chainId: opportunity.chainId,
  routePath: opportunity.routePath.map((item) => ({
    pool: item.poolAddress,
    tokenIn: item.tokenIn,
    tokenOut: item.tokenOut,
    dex: dexNameMap[item.dex] ?? item.dex,
  })),
  hops: opportunity.hops,
  estimatedProfitUsd: opportunity.estimatedProfitUsd,
  confidenceScore: opportunity.confidenceScore,
  flashLoanToken: opportunity.flashLoan.token,
  flashLoanAmount: opportunity.flashLoan.amount,
  gasEstimateGwei: opportunity.gasEstimate.gwei,
  expiresInMs: opportunity.expiresInMs,
  demandPrediction: {
    impactedPools: opportunity.demandPrediction.impactedPools,
    predictedProfitChange: opportunity.demandPrediction.predictedProfitChangeUsd,
    badge: opportunity.demandPrediction.badge,
  },
  discoveredAt: opportunity.discoveredAt,
});

export const registerOpportunitiesRoutes = (app: FastifyInstance, opportunitiesService: OpportunitiesService) => {
  app.get('/api/v1/routes/opportunities', { preHandler: app.authenticate() }, async (request, reply) => {
    const principal = request.principal!;
    if (!canAccessOpportunities(principal.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'Trader tier required');
    }

    const query = querySchema.parse(request.query);
    const result = await opportunitiesService.list(query);
    return reply.code(200).send({
      success: true,
      data: {
        opportunities: result.opportunities.map(toOpportunityApiView),
      },
      meta: result.meta,
    });
  });
};
