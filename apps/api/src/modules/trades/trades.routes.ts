import type { FastifyInstance } from 'fastify';

import { success } from '../../app';
import type { TradesService } from './trades.service';
import { listTradesQuerySchema, tradeSummaryQuerySchema } from './trades.schemas';

export const registerTradesRoutes = (app: FastifyInstance, tradesService: TradesService) => {
  app.get('/api/v1/trades', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = listTradesQuerySchema.parse(request.query);
    const result = await tradesService.list(request.principal!.userId, query);
    return reply.code(200).send({ success: true, data: { trades: result.trades }, meta: result.meta });
  });

  app.get('/api/v1/trades/summary', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = tradeSummaryQuerySchema.parse(request.query);
    const summary = await tradesService.getSummary(request.principal!.userId, query);
    return success(reply, 200, { summary });
  });

  app.get('/api/v1/trades/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const tradeId = (request.params as { id: string }).id;
    const result = await tradesService.getById(request.principal!.userId, tradeId);
    return success(reply, 200, { trade: result.trade, hops: result.hops });
  });
};
