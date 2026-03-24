import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkDatabaseHealth, createPrismaClient } from './client';

afterEach(() => {
  vi.useRealTimers();
});

describe('createPrismaClient', () => {
  it('configures verbose logging in development', () => {
    const PrismaClient = vi.fn().mockImplementation((options) => ({ options }));

    const client = createPrismaClient({
      nodeEnv: 'development',
      PrismaClient,
    });

    expect(PrismaClient).toHaveBeenCalledWith({
      log: ['query', 'error', 'warn'],
    });
    expect(client).toEqual({
      options: {
        log: ['query', 'error', 'warn'],
      },
    });
  });

  it('checks database health with a simple query', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    };

    await expect(checkDatabaseHealth(client)).resolves.toEqual({
      name: 'database',
      status: 'healthy',
      details: { latencyMs: expect.any(Number) },
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('marks the database unhealthy when the probe fails', async () => {
    const client = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    };

    await expect(checkDatabaseHealth(client)).resolves.toEqual({
      name: 'database',
      status: 'unhealthy',
      details: { message: 'connect ECONNREFUSED' },
    });
  });

  it('clears the database timeout when the probe resolves early', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    };

    const probe = checkDatabaseHealth(client, 5000);
    await vi.runAllTimersAsync();

    await expect(probe).resolves.toEqual({
      name: 'database',
      status: 'healthy',
      details: { latencyMs: expect.any(Number) },
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
