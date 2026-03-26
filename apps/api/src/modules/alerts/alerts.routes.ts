import type { FastifyInstance } from 'fastify';

import { getRequestMetadata, success } from '../../app';
import type { AlertsService } from './alerts.service';
import { createAlertSchema, updateAlertSchema, listAlertsQuerySchema, alertHistoryQuerySchema } from './alerts.schemas';

export const registerAlertsRoutes = (app: FastifyInstance, alertsService: AlertsService) => {
  app.get('/api/v1/alerts', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = listAlertsQuerySchema.parse(request.query);
    const result = await alertsService.list(request.principal!.userId, query);
    return reply.code(200).send({ success: true, data: { alerts: result.alerts }, meta: result.meta });
  });

  app.post('/api/v1/alerts', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = createAlertSchema.parse(request.body);
    const alert = await alertsService.create(request.principal!.userId, input, getRequestMetadata(request));
    return success(reply, 201, { alert });
  });

  app.get('/api/v1/alerts/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const alertId = (request.params as { id: string }).id;
    return success(reply, 200, { alert: await alertsService.get(request.principal!.userId, alertId) });
  });

  app.patch('/api/v1/alerts/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const alertId = (request.params as { id: string }).id;
    const input = updateAlertSchema.parse(request.body);
    return success(reply, 200, { alert: await alertsService.update(request.principal!.userId, alertId, input, getRequestMetadata(request)) });
  });

  app.delete('/api/v1/alerts/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const alertId = (request.params as { id: string }).id;
    await alertsService.delete(request.principal!.userId, alertId, getRequestMetadata(request));
    return success(reply, 200, { message: 'Alert deleted' });
  });

  app.get('/api/v1/alerts/:id/history', { preHandler: app.authenticate() }, async (request, reply) => {
    const alertId = (request.params as { id: string }).id;
    const query = alertHistoryQuerySchema.parse(request.query);
    const result = await alertsService.getHistory(request.principal!.userId, alertId, query);
    return reply.code(200).send({ success: true, data: { history: result.history }, meta: result.meta });
  });
};
