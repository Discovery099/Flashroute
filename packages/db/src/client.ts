import { PrismaClient } from '@prisma/client';

import { runHealthCheck, type HealthCheckResult } from '@flashroute/shared/health';

type PrismaLogLevel = 'query' | 'error' | 'warn';

export interface PrismaClientLike {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
  $disconnect?: () => Promise<void>;
}

export interface PrismaClientConstructor<T> {
  new (options: { log: PrismaLogLevel[] }): T;
}

export interface CreatePrismaClientOptions<T> {
  nodeEnv?: string;
  PrismaClient?: PrismaClientConstructor<T>;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

export const createPrismaClient = <T = PrismaClient>(
  options: CreatePrismaClientOptions<T> = {},
): T => {
  const Client = (options.PrismaClient ?? PrismaClient) as PrismaClientConstructor<T>;
  const log: PrismaLogLevel[] = options.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'];

  return new Client({ log });
};

export const checkDatabaseHealth = async (
  client: PrismaClientLike,
  timeoutMs = 5000,
): Promise<HealthCheckResult> =>
  runHealthCheck('database', async () => {
    await withTimeout(client.$queryRaw`SELECT 1`, timeoutMs);
    return {};
  });

export const disconnectPrismaClient = async (client: PrismaClientLike): Promise<void> => {
  await client.$disconnect?.();
};
