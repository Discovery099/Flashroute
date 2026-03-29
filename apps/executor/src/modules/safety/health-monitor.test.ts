import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from './health-monitor';

describe('HealthMonitor', () => {
  let mockRedis: any;
  let onUnhealthy: any;
  let clock: any;
  let healthMonitor: HealthMonitor;

  const STALE_THRESHOLD_MS = 120_000;

  beforeEach(() => {
    vi.useFakeTimers();

    mockRedis = {
      get: vi.fn(),
    };
    onUnhealthy = vi.fn();

    healthMonitor = new HealthMonitor(mockRedis, onUnhealthy, {
      checkIntervalMs: 10_000,
      staleThresholdMs: STALE_THRESHOLD_MS,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    healthMonitor.stop();
  });

  it('marks chain healthy when heartbeats are fresh', async () => {
    mockRedis.get.mockResolvedValue(new Date().toISOString());
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
  });

  it('calls onUnhealthy when pool-indexer heartbeat is stale', async () => {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    mockRedis.get.mockResolvedValue(staleTime);
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('calls onUnhealthy when analytics-engine heartbeat is stale', async () => {
    mockRedis.get
      .mockResolvedValueOnce(new Date().toISOString())
      .mockResolvedValueOnce(new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString());

    healthMonitor.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('fail-closes: marks unhealthy when Redis errors', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis error'));
    healthMonitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, true);
  });

  it('marks chain healthy again when heartbeats recover', async () => {
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
    mockRedis.get.mockResolvedValueOnce(staleTime);
    healthMonitor.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onUnhealthy).toHaveBeenCalledWith(1, true);

    onUnhealthy.mockClear();
    mockRedis.get.mockResolvedValueOnce(new Date().toISOString());
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onUnhealthy).toHaveBeenCalledWith(1, false);
  });

  it('stops the background loop', async () => {
    healthMonitor.start();
    healthMonitor.stop();
    mockRedis.get.mockRejectedValue(new Error('Redis error'));

    await vi.advanceTimersByTimeAsync(20_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
  });
});
