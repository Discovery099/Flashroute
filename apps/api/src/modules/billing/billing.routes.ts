import type { FastifyInstance, FastifyRequest } from 'fastify';
import { success, ApiError } from '../../app';
import type { BillingService } from './billing.service';
import type { WebhookIdempotencyGuard } from './webhook-idempotency';
import type { PrismaWebhookClient } from './webhook-idempotency';
import { checkoutBodySchema } from './billing.schemas';

export const registerBillingRoutes = (
  app: FastifyInstance,
  service: BillingService,
  idempotencyGuard: WebhookIdempotencyGuard,
) => {
  app.post('/api/v1/billing/checkout', { preHandler: app.authenticate() }, async (request, reply) => {
    const { plan } = checkoutBodySchema.parse(request.body);
    try {
      const { checkoutUrl } = await service.createCheckoutSession(request.principal!.userId, plan);
      return success(reply, 200, { checkoutUrl });
    } catch (err: any) {
      if (err.message === 'INVALID_PLAN') throw new ApiError(400, 'INVALID_PLAN', 'Unknown plan');
      if (err.message === 'User not found') throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
      throw err;
    }
  });

  app.post('/api/v1/billing/portal', { preHandler: app.authenticate() }, async (request, reply) => {
    try {
      const { portalUrl } = await service.createPortalSession(request.principal!.userId);
      return success(reply, 200, { portalUrl });
    } catch (err: any) {
      if (err.message === 'NO_BILLING_ACCOUNT') throw new ApiError(400, 'NO_BILLING_ACCOUNT', 'No billing account found. Please subscribe first.');
      throw err;
    }
  });

  app.get('/api/v1/billing/subscription', { preHandler: app.authenticate() }, async (request, reply) => {
    const subscription = await service.getSubscription(request.principal!.userId);
    return success(reply, 200, subscription);
  });

  app.post('/api/v1/billing/webhooks/stripe', {
    config: { rawBody: true },
  }, async (request: FastifyRequest, reply) => {
    const rawBody = (request as any).rawBody as Buffer;
    const signature = request.headers['stripe-signature'] as string;
    if (!signature) throw new ApiError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Missing Stripe-Signature header');

    let eventId: string | undefined;
    try {
      const parsed = JSON.parse(rawBody.toString());
      eventId = parsed?.id;
    } catch {
      throw new ApiError(400, 'WEBHOOK_PAYLOAD_INVALID', 'Invalid JSON payload');
    }

    if (!eventId) {
      throw new ApiError(400, 'WEBHOOK_EVENT_ID_MISSING', 'Missing event ID');
    }

    const { canProcess } = await idempotencyGuard.checkAndSet(eventId, 'unknown');
    if (!canProcess) {
      return reply.code(200).send({ received: true, duplicate: true });
    }

    try {
      await service.handleWebhook(rawBody, signature);
      await idempotencyGuard.markProcessed(eventId);
      return reply.code(200).send({ received: true });
    } catch (err: any) {
      await idempotencyGuard.markFailed(eventId, err.message);
      if (err.message === 'WEBHOOK_SIGNATURE_INVALID') {
        throw new ApiError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature');
      }
      request.log.error({ err }, 'Webhook processing failed');
      throw new ApiError(500, 'INTERNAL_ERROR', 'Webhook processing failed');
    }
  });
};
