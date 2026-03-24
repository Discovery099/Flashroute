import type { FastifyInstance } from 'fastify';

import { getRequestMetadata, success } from '../../app';
import type { StrategiesService } from './strategies.service';
import { createStrategySchema, deleteStrategyQuerySchema, listStrategiesQuerySchema, updateStrategySchema } from './strategies.schemas';

export const registerStrategiesRoutes = (app: FastifyInstance, strategiesService: StrategiesService) => {
  app.get('/api/v1/strategies', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = listStrategiesQuerySchema.parse(request.query);
    const result = await strategiesService.list(request.principal!.userId, query);
    return reply.code(200).send({ success: true, data: { strategies: result.strategies }, meta: result.meta });
  });

  app.post('/api/v1/strategies', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = createStrategySchema.parse(request.body);
    const strategy = await strategiesService.create(request.principal!.userId, input, getRequestMetadata(request));
    return success(reply, 201, { strategy });
  });

  app.get('/api/v1/strategies/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const strategyId = (request.params as { id: string }).id;
    return success(reply, 200, await strategiesService.getById(request.principal!.userId, strategyId));
  });

  app.patch('/api/v1/strategies/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const strategyId = (request.params as { id: string }).id;
    const input = updateStrategySchema.parse(request.body);
    return success(reply, 200, {
      strategy: await strategiesService.update(request.principal!.userId, strategyId, input, getRequestMetadata(request)),
    });
  });

  app.post('/api/v1/strategies/:id/activate', { preHandler: app.authenticate() }, async (request, reply) => {
    const strategyId = (request.params as { id: string }).id;
    return success(reply, 200, {
      strategy: await strategiesService.activate(request.principal!.userId, strategyId, getRequestMetadata(request)),
    });
  });

  app.post('/api/v1/strategies/:id/deactivate', { preHandler: app.authenticate() }, async (request, reply) => {
    const strategyId = (request.params as { id: string }).id;
    return success(reply, 200, {
      strategy: await strategiesService.deactivate(request.principal!.userId, strategyId, getRequestMetadata(request)),
    });
  });

  app.delete('/api/v1/strategies/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const strategyId = (request.params as { id: string }).id;
    const query = deleteStrategyQuerySchema.parse(request.query);
    await strategiesService.delete(request.principal!.userId, strategyId, query.confirm, getRequestMetadata(request));
    return success(reply, 200, { message: 'Strategy deleted' });
  });
};
