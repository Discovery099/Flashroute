import { describe, expect, it } from 'vitest';

import { runHealthCheck } from './health';

describe('runHealthCheck', () => {
  it('returns healthy details when the probe succeeds', async () => {
    await expect(
      runHealthCheck('database', async () => ({ connected: true })),
    ).resolves.toEqual({
      name: 'database',
      status: 'healthy',
      details: { connected: true, latencyMs: expect.any(Number) },
    });
  });

  it('captures failures as unhealthy status', async () => {
    await expect(
      runHealthCheck('redis', async () => {
        throw new Error('PING timeout');
      }),
    ).resolves.toEqual({
      name: 'redis',
      status: 'unhealthy',
      details: { message: 'PING timeout' },
    });
  });
});
