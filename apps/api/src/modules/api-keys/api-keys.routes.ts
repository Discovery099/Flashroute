import type { FastifyInstance } from 'fastify';

import { getRequestMetadata, success } from '../../app';
import { createApiKeySchema, updateApiKeySchema } from '../auth/auth.schemas';
import type { ApiKeysService } from './api-keys.service';

export const registerApiKeyRoutes = (app: FastifyInstance, apiKeysService: ApiKeysService) => {
  app.get('/api/v1/api-keys', { preHandler: app.authenticate() }, async (request, reply) =>
    success(reply, 200, { apiKeys: await apiKeysService.list(request.principal!.userId) }),
  );

  app.post('/api/v1/api-keys', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = createApiKeySchema.parse(request.body);
    const result = await apiKeysService.create(request.principal!.userId, input, getRequestMetadata(request));
    return success(reply, 201, result);
  });

  app.patch('/api/v1/api-keys/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const input = updateApiKeySchema.parse(request.body);
    const id = (request.params as { id: string }).id;
    return success(reply, 200, {
      apiKey: await apiKeysService.update(request.principal!.userId, id, input, getRequestMetadata(request)),
    });
  });

  app.delete('/api/v1/api-keys/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    await apiKeysService.revoke(request.principal!.userId, id, getRequestMetadata(request));
    return success(reply, 200, { message: 'API key revoked' });
  });
};
