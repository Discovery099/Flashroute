import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkRedisHealth, createRedisClients, type RedisClientOptions } from './redis';

afterEach(() => {
  vi.useRealTimers();
});

describe('createRedisClients', () => {
  it('creates separate cache pub sub and queue clients with namespaces', () => {
    const factory = vi.fn((url: string, options: RedisClientOptions) => ({
      url,
      options,
      ping: vi.fn(),
      quit: vi.fn(),
    }));

    const clients = createRedisClients(
      {
        url: 'redis://localhost:6379',
        cacheDb: 0,
        pubSubDb: 1,
        queueDb: 2,
        keyPrefix: 'fr:',
        queuePrefix: 'fr:queue:',
      },
      factory,
    );

    expect(factory).toHaveBeenCalledTimes(4);
    expect(clients.cache.options).toMatchObject({ db: 0, keyPrefix: 'fr:' });
    expect(clients.publisher.options).toMatchObject({ db: 1, keyPrefix: 'fr:' });
    expect(clients.subscriber.options).toMatchObject({ db: 1, keyPrefix: 'fr:' });
    expect(clients.queue.options).toMatchObject({ db: 2, keyPrefix: 'fr:queue:' });
  });

  it('returns a healthy redis probe when ping succeeds', async () => {
    await expect(
      checkRedisHealth({
        ping: vi.fn().mockResolvedValue('PONG'),
      }),
    ).resolves.toEqual({
      name: 'redis',
      status: 'healthy',
      details: { latencyMs: expect.any(Number) },
    });
  });

  it('clears the redis timeout when ping resolves early', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const probe = checkRedisHealth(
      {
        ping: vi.fn().mockResolvedValue('PONG'),
      },
      2000,
    );

    await vi.runAllTimersAsync();

    await expect(probe).resolves.toEqual({
      name: 'redis',
      status: 'healthy',
      details: { latencyMs: expect.any(Number) },
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
