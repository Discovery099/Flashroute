import Redis from 'ioredis';

import { runHealthCheck, type HealthCheckResult } from '@flashroute/shared/health';

export interface RedisBootstrapConfig {
  url: string;
  cacheDb: number;
  pubSubDb: number;
  queueDb: number;
  keyPrefix: string;
  queuePrefix: string;
}

export interface RedisClientLike {
  ping: () => Promise<string>;
  quit?: () => Promise<unknown>;
}

export interface RedisClientOptions {
  db: number;
  keyPrefix: string;
  maxRetriesPerRequest: null;
  lazyConnect: boolean;
  enableAutoPipelining: boolean;
  retryStrategy: (attempt: number) => number;
}

export interface RedisClients<T extends RedisClientLike = Redis> {
  cache: T;
  publisher: T;
  subscriber: T;
  queue: T;
}

type RedisFactory<T extends RedisClientLike> = (url: string, options: RedisClientOptions) => T;

const createOptions = (db: number, keyPrefix: string): RedisClientOptions => ({
  db,
  keyPrefix,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableAutoPipelining: true,
  retryStrategy: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
});

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Redis health check timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

export const createRedisClients = <T extends RedisClientLike = Redis>(
  config: RedisBootstrapConfig,
  factory: RedisFactory<T> = (url, options) => new Redis(url, options) as unknown as T,
): RedisClients<T> => ({
  cache: factory(config.url, createOptions(config.cacheDb, config.keyPrefix)),
  publisher: factory(config.url, createOptions(config.pubSubDb, config.keyPrefix)),
  subscriber: factory(config.url, createOptions(config.pubSubDb, config.keyPrefix)),
  queue: factory(config.url, createOptions(config.queueDb, config.queuePrefix)),
});

export const checkRedisHealth = async (
  client: RedisClientLike,
  timeoutMs = 2000,
): Promise<HealthCheckResult> =>
  runHealthCheck('redis', async () => {
    await withTimeout(client.ping(), timeoutMs);
    return {};
  });

export const closeRedisClients = async (clients: RedisClients): Promise<void> => {
  await Promise.all([
    clients.cache.quit?.(),
    clients.publisher.quit?.(),
    clients.subscriber.quit?.(),
    clients.queue.quit?.(),
  ]);
};
