import type { FastifyInstance } from 'fastify';

export const registerStripeWebhookMiddleware = (app: FastifyInstance) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as any).rawBody = body;
      done(null, JSON.parse(body.toString()));
    } catch (err) {
      done(err as Error, undefined as any);
    }
  });
};
