import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loadEnv } from './env';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '4000',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgresql://flashroute:flashroute@localhost:5432/flashroute',
  REDIS_URL: 'redis://localhost:6379',
  REDIS_CACHE_DB: '0',
  REDIS_PUBSUB_DB: '1',
  REDIS_QUEUE_DB: '2',
  JWT_SECRET: '12345678901234567890123456789012',
  JWT_ACCESS_TTL: '900',
  JWT_REFRESH_TTL: '604800',
  ETHEREUM_RPC_URL: 'https://eth.example/rpc',
  ETHEREUM_WS_URL: 'wss://eth.example/ws',
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  EMAIL_FROM: 'alerts@flashroute.test',
  SMTP_URL: 'smtp://localhost:2525',
  EXECUTION_WALLET_PRIVATE_KEY:
    '0x1234567890123456789012345678901234567890123456789012345678901234',
  EXECUTION_WALLET_ADDRESS: '0x0000000000000000000000000000000000000001',
  CHAIN_ETHEREUM_ENABLED: 'true',
} satisfies NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('loads grouped config and applies defaults', () => {
    const config = loadEnv(validEnv);

    expect(config.core).toMatchObject({
      nodeEnv: 'development',
      port: 4000,
      logLevel: 'debug',
      serviceName: 'flashroute',
    });
    expect(config.database).toEqual({
      url: validEnv.DATABASE_URL,
      enableQueryLogging: true,
    });
    expect(config.redis).toEqual({
      url: validEnv.REDIS_URL,
      cacheDb: 0,
      pubSubDb: 1,
      queueDb: 2,
      keyPrefix: 'fr:',
      queuePrefix: 'fr:queue:',
    });
    expect(config.auth).toMatchObject({
      jwtSecret: validEnv.JWT_SECRET,
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604800,
    });
    expect(config.chains.ethereum).toEqual({
      enabled: true,
      rpcUrl: validEnv.ETHEREUM_RPC_URL,
      wsUrl: validEnv.ETHEREUM_WS_URL,
    });
    expect(config.stripe).toEqual({
      secretKey: validEnv.STRIPE_SECRET_KEY,
      webhookSecret: validEnv.STRIPE_WEBHOOK_SECRET,
    });
    expect(config.email).toEqual({
      from: validEnv.EMAIL_FROM,
      smtpUrl: validEnv.SMTP_URL,
    });
    expect(config.executionWallet).toEqual({
      privateKey: validEnv.EXECUTION_WALLET_PRIVATE_KEY,
      address: validEnv.EXECUTION_WALLET_ADDRESS,
    });
  });

  it('fails fast with detailed validation errors for missing and invalid vars', () => {
    try {
      loadEnv({
        ...validEnv,
        DATABASE_URL: '',
        JWT_SECRET: 'short',
        REDIS_CACHE_DB: '-1',
        ETHEREUM_RPC_URL: 'not-a-url',
      });
      throw new Error('Expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);

      const messages = (error as ZodError).issues.map((issue) => `${issue.path.join('.')}:${issue.message}`);

      expect(messages).toContain('DATABASE_URL:DATABASE_URL is required');
      expect(messages).toContain('JWT_SECRET:JWT_SECRET must be at least 32 characters');
      expect(messages).toContain('REDIS_CACHE_DB:Number must be greater than or equal to 0');
      expect(messages).toContain('ETHEREUM_RPC_URL:ETHEREUM_RPC_URL must be a valid URL');
    }
  });

  it('rejects invalid boolean env values instead of coercing them', () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        CHAIN_ETHEREUM_ENABLED: 'yes',
      }),
    ).toThrowError(ZodError);

    try {
      loadEnv({
        ...validEnv,
        CHAIN_ETHEREUM_ENABLED: 'yes',
      });
    } catch (error) {
      const messages = (error as ZodError).issues.map((issue) => `${issue.path.join('.')}:${issue.message}`);

      expect(messages).toContain(
        'CHAIN_ETHEREUM_ENABLED:CHAIN_ETHEREUM_ENABLED must be either "true" or "false"',
      );
    }
  });
});
