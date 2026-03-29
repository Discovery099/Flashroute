import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertPublisher } from './alert-publisher';

describe('AlertPublisher', () => {
  let mockRedis: any;
  let publisher: AlertPublisher;

  beforeEach(() => {
    mockRedis = {
      publish: vi.fn().mockResolvedValue(1),
    };
    publisher = new AlertPublisher(mockRedis);
  });

  it('publishes auto_pause alert on consecutive failures', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_failures',
      consecutiveCount: 5,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"type":"auto_pause"')
    );
    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"consecutive_failures"')
    );
  });

  it('publishes auto_pause alert on consecutive drift', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_drift',
      consecutiveCount: 3,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"consecutive_drift"')
    );
  });

  it('publishes auto_pause alert on heartbeat stale', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'heartbeat_stale',
      consecutiveCount: 0,
      pausedChains: [1],
    });

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'fr:system:alert',
      expect.stringContaining('"trigger":"heartbeat_stale"')
    );
  });

  it('includes timestamp in ISO format', async () => {
    await publisher.publishAutoPause({
      chainId: 1,
      trigger: 'consecutive_failures',
      consecutiveCount: 5,
      pausedChains: [1],
    });

    const call = mockRedis.publish.mock.calls[0];
    const alert = JSON.parse(call[1]);
    expect(new Date(alert.timestamp).toISOString()).toBe(alert.timestamp);
  });
});
