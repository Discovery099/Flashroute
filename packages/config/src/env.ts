import { z } from 'zod';

const toInt = (field: string, fallback?: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === '') {
        return fallback;
      }

      if (typeof value === 'number') {
        return value;
      }

      return Number(value);
    },
    z.number({ invalid_type_error: `${field} must be a number` }).int(),
  );

const toBoolean = (fallback = false) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === '') {
        return fallback;
      }

      if (typeof value === 'boolean') {
        return value;
      }

      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }

      return value;
    },
    z.boolean({ invalid_type_error: 'CHAIN_ETHEREUM_ENABLED must be either "true" or "false"' }),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: toInt('PORT', 3000).pipe(z.number().positive()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().min(1).default('flashroute'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_CACHE_DB: toInt('REDIS_CACHE_DB', 0).pipe(z.number().min(0)),
  REDIS_PUBSUB_DB: toInt('REDIS_PUBSUB_DB', 1).pipe(z.number().min(0)),
  REDIS_QUEUE_DB: toInt('REDIS_QUEUE_DB', 2).pipe(z.number().min(0)),
  REDIS_KEY_PREFIX: z.string().min(1).default('fr:'),
  REDIS_QUEUE_PREFIX: z.string().min(1).default('fr:queue:'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: toInt('JWT_ACCESS_TTL', 900).pipe(z.number().positive()),
  JWT_REFRESH_TTL: toInt('JWT_REFRESH_TTL', 604800).pipe(z.number().positive()),
  ETHEREUM_RPC_URL: z.string().url('ETHEREUM_RPC_URL must be a valid URL'),
  ETHEREUM_WS_URL: z.string().url('ETHEREUM_WS_URL must be a valid URL'),
  CHAIN_ETHEREUM_ENABLED: toBoolean(true),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email address').optional(),
  SMTP_URL: z.string().url('SMTP_URL must be a valid URL').optional(),
  EXECUTION_WALLET_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'EXECUTION_WALLET_PRIVATE_KEY must be a 32-byte hex string')
    .optional(),
  EXECUTION_WALLET_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'EXECUTION_WALLET_ADDRESS must be a valid address')
    .optional(),
});

export type AppConfig = ReturnType<typeof loadEnv>;

export const loadEnv = (env: NodeJS.ProcessEnv = process.env) => {
  const parsed = envSchema.parse(env);

  return {
    core: {
      nodeEnv: parsed.NODE_ENV,
      port: parsed.PORT,
      logLevel: parsed.LOG_LEVEL,
      serviceName: parsed.SERVICE_NAME,
    },
    database: {
      url: parsed.DATABASE_URL,
      enableQueryLogging: parsed.NODE_ENV !== 'production',
    },
    redis: {
      url: parsed.REDIS_URL,
      cacheDb: parsed.REDIS_CACHE_DB,
      pubSubDb: parsed.REDIS_PUBSUB_DB,
      queueDb: parsed.REDIS_QUEUE_DB,
      keyPrefix: parsed.REDIS_KEY_PREFIX,
      queuePrefix: parsed.REDIS_QUEUE_PREFIX,
    },
    auth: {
      jwtSecret: parsed.JWT_SECRET,
      accessTokenTtlSeconds: parsed.JWT_ACCESS_TTL,
      refreshTokenTtlSeconds: parsed.JWT_REFRESH_TTL,
    },
    chains: {
      ethereum: {
        enabled: parsed.CHAIN_ETHEREUM_ENABLED,
        rpcUrl: parsed.ETHEREUM_RPC_URL,
        wsUrl: parsed.ETHEREUM_WS_URL,
      },
    },
    stripe: {
      secretKey: parsed.STRIPE_SECRET_KEY,
      webhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    },
    email: {
      from: parsed.EMAIL_FROM,
      smtpUrl: parsed.SMTP_URL,
    },
    executionWallet: {
      privateKey: parsed.EXECUTION_WALLET_PRIVATE_KEY,
      address: parsed.EXECUTION_WALLET_ADDRESS,
    },
  };
};
