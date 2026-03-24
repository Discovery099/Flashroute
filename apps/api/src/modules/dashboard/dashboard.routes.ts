import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { success } from '../../app';
import type { OpportunitiesService } from '../opportunities/opportunities.service';

const querySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  period: z.enum(['7d', '30d', '90d', 'all']).default('7d'),
});

export const registerDashboardRoutes = (app: FastifyInstance, opportunitiesService: OpportunitiesService) => {
  app.get('/api/v1/analytics/dashboard', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = querySchema.parse(request.query);
    return success(reply, 200, {
      dashboard: await opportunitiesService.getDashboardShell(query.period, query.chainId),
    });
  });
};
