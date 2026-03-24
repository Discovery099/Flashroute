import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { registerDashboardRoutes } from './modules/dashboard/dashboard.routes';
import { registerApiKeyRoutes } from './modules/api-keys/api-keys.routes';
import { ApiKeysService } from './modules/api-keys/api-keys.service';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { AuthService, type AuthServiceOptions } from './modules/auth/auth.service';
import {
  type AuthRepository,
  type EmailJobQueue,
  type EphemeralAuthStore,
  type RateLimitStore,
} from './modules/auth/auth.repository';
import { LiveGateway } from './modules/live/live.gateway';
import { registerLiveRoutes, type LivePubSubSubscriber } from './modules/live/live.routes';
import { registerOpportunitiesRoutes } from './modules/opportunities/opportunities.routes';
import {
  OpportunitiesService,
  RedisOpportunitiesRepository,
  type OpportunitiesCacheClient,
  type OpportunitiesRepository,
} from './modules/opportunities/opportunities.service';
import { registerStrategiesRoutes } from './modules/strategies/strategies.routes';
import { PrismaStrategiesRepository, type StrategiesRepository } from './modules/strategies/strategies.repository';
import { StrategiesService } from './modules/strategies/strategies.service';
import { registerUserRoutes } from './modules/users/user.routes';
import { UserService } from './modules/users/user.service';
import { registerAuthPlugin } from './plugins/auth';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface BuildApiAppOptions {
  authRepository: AuthRepository;
  ephemeralAuthStore: EphemeralAuthStore;
  emailQueue: EmailJobQueue;
  rateLimitStore: RateLimitStore;
  auth: AuthServiceOptions;
  opportunitiesCache: OpportunitiesCacheClient;
  opportunitiesRepository?: OpportunitiesRepository;
  livePubSubSubscriber?: LivePubSubSubscriber;
  opportunitiesService?: OpportunitiesService;
  strategiesRepository?: StrategiesRepository;
  strategyEventPublisher?: { publish(channel: string, payload: string): Promise<number> };
  liveGateway?: LiveGateway;
}

export const success = (reply: FastifyReply, statusCode: number, data: unknown) =>
  reply.code(statusCode).send({ success: true, data });

const errorResponse = (reply: FastifyReply, statusCode: number, code: string, message: string, details?: unknown) =>
  reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      timestamp: new Date().toISOString(),
      requestId: reply.request.id,
    },
  });

export const getRequestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? request.ip,
  userAgent: request.headers['user-agent']?.toString(),
  requestId: request.id,
});

export const buildApiApp = (options: BuildApiAppOptions): FastifyInstance => {
  const app = Fastify({ logger: false });

  const authService = new AuthService(
    options.authRepository,
    options.ephemeralAuthStore,
    options.emailQueue,
    options.rateLimitStore,
    options.auth,
  );
  const opportunitiesRepository = options.opportunitiesRepository ?? new RedisOpportunitiesRepository(options.opportunitiesCache);
  const opportunitiesService = options.opportunitiesService ?? new OpportunitiesService(opportunitiesRepository);
  const userService = new UserService(authService);
  const apiKeysService = new ApiKeysService(options.authRepository, options.auth);
  const strategiesRepository = options.strategiesRepository ?? new PrismaStrategiesRepository(options.authRepository as never);
  const strategiesService = new StrategiesService(options.authRepository, strategiesRepository, options.strategyEventPublisher);
  const liveGateway =
    options.liveGateway ??
    new LiveGateway({
      verifyToken: (token) => {
        if (!token) {
          return null;
        }

        const payload = authService.verifyAccessToken(token);
        return {
          userId: payload.sub,
          role: payload.role,
        };
      },
    });

  app.decorate('authService', authService);
  app.decorate('userService', userService);
  app.decorate('apiKeysService', apiKeysService);
  app.decorate('opportunitiesService', opportunitiesService);
  app.decorate('strategiesService', strategiesService);
  app.decorate('liveGateway', liveGateway);

  registerAuthPlugin(app, { authService, apiKeysService });
  registerAuthRoutes(app, authService);
  registerUserRoutes(app, userService);
  registerApiKeyRoutes(app, apiKeysService);
  registerOpportunitiesRoutes(app, opportunitiesService);
  registerStrategiesRoutes(app, strategiesService);
  registerDashboardRoutes(app, opportunitiesService);
  app.register(async (instance) => {
    await registerLiveRoutes(instance, liveGateway, options.livePubSubSubscriber);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return errorResponse(reply, error.statusCode, error.code, error.message, error.details);
    }

    if (error instanceof ZodError) {
      return errorResponse(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid input data',
        error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    request.log.error(error);
    return errorResponse(reply, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  });

  app.get('/health', async (_request, reply) => success(reply, 200, { status: 'ok' }));

  return app;
};
