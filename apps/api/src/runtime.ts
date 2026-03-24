import { createPrismaClient } from '@flashroute/db/client';
import { createRedisClients } from '@flashroute/db/redis';

import { buildApiApp } from './app';
import {
  PrismaAuthRepository,
  RedisEmailJobQueue,
  RedisEphemeralAuthStore,
  RedisRateLimitStore,
} from './modules/auth/auth.repository';
import type { AuthServiceOptions } from './modules/auth/auth.service';
import { PrismaStrategiesRepository } from './modules/strategies/strategies.repository';

export interface ApiRuntimeOptions {
  databaseUrl?: string;
  redisUrl: string;
  redisKeyPrefix: string;
  redisQueuePrefix: string;
  auth: AuthServiceOptions;
  ethRpcUrl?: string;
}

export const createApiRuntime = (options: ApiRuntimeOptions) => {
  const prisma = createPrismaClient({ nodeEnv: process.env.NODE_ENV });
  const redisClients = createRedisClients({
    url: options.redisUrl,
    cacheDb: 0,
    pubSubDb: 1,
    queueDb: 2,
    keyPrefix: options.redisKeyPrefix,
    queuePrefix: options.redisQueuePrefix,
  });

  return buildApiApp({
    authRepository: new PrismaAuthRepository(prisma as never),
    strategiesRepository: new PrismaStrategiesRepository(prisma as never),
    ephemeralAuthStore: new RedisEphemeralAuthStore(redisClients.cache, options.redisKeyPrefix),
    emailQueue: new RedisEmailJobQueue(redisClients.queue, `${options.redisQueuePrefix}email`),
    rateLimitStore: new RedisRateLimitStore(redisClients.cache, options.redisKeyPrefix),
    opportunitiesCache: redisClients.cache as never,
    strategyEventPublisher: redisClients.publisher as never,
    livePubSubSubscriber: redisClients.subscriber as never,
    auth: options.auth,
    rpcUrl: options.ethRpcUrl ?? process.env.ETH_RPC_URL ?? 'https://eth.llamarpc.com',
  });
};
