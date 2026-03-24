import type { FastifyInstance } from 'fastify';
import { success, ApiError } from '../../app';
import type { AnalyticsService } from './analytics.service';
import {
  analyticsOverviewQuerySchema,
  analyticsRoutesQuerySchema,
  analyticsCompetitorsQuerySchema,
  analyticsGasQuerySchema,
} from './analytics.schemas';

export const registerAnalyticsRoutes = (app: FastifyInstance, service: AnalyticsService) => {
  app.get('/api/v1/analytics/overview', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsOverviewQuerySchema.parse(request.query);
    const data = await service.getOverview(request.principal!.userId, query);
    return success(reply, 200, data);
  });

  app.get('/api/v1/analytics/routes', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsRoutesQuerySchema.parse(request.query);
    const data = await service.getRoutes(request.principal!.userId, query);
    return success(reply, 200, { routes: data.routes });
  });

  app.get('/api/v1/analytics/competitors', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsCompetitorsQuerySchema.parse(request.query);
    if (!['trader', 'executor', 'institutional'].includes(request.principal!.role)) {
      throw new ApiError(403, 'TIER_LIMIT', 'Competitor analytics require Trader plan or higher.');
    }
    const data = await service.getCompetitors(query);
    return success(reply, 200, data);
  });

  app.get('/api/v1/analytics/gas', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsGasQuerySchema.parse(request.query);
    const gas = await service.getGas(request.principal!.userId, query);
    return success(reply, 200, { gas });
  });
};
