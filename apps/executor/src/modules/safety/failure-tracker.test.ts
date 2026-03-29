import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailureTracker } from './failure-tracker';

describe('FailureTracker', () => {
  let mockRedis: any;
  let tracker: FailureTracker;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };
    tracker = new FailureTracker(mockRedis);
  });

  it('starts with zero consecutive failures', () => {
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('increments failure counter on reverted result', async () => {
    await tracker.record(1, 'reverted');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(1);
  });

  it('increments failure counter on failed result', async () => {
    await tracker.record(1, 'failed');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(1);
  });

  it('increments drift counter on absolute loss', async () => {
    await tracker.recordDrift(1, -15_000_000n);
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(1);
  });

  it('does not increment drift counter on small loss below threshold', async () => {
    await tracker.recordDrift(1, -5_000_000n);
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('resets counters to zero on included result', async () => {
    await tracker.record(1, 'reverted');
    await tracker.record(1, 'reverted');
    await tracker.record(1, 'included');
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('resets drift counter on non-negative profit', async () => {
    await tracker.recordDrift(1, -15_000_000n);
    await tracker.recordNonNegativeProfit(1);
    const state = tracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('persists state to Redis', async () => {
    await tracker.record(1, 'reverted');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'fr:pause:1',
      expect.any(String),
      'EX',
      86400
    );
  });

  it('returns isPaused=true when MAX_CONSECUTIVE_FAILURES exceeded', async () => {
    for (let i = 0; i < 5; i++) await tracker.record(1, 'reverted');
    const state = tracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(state.consecutiveFailures).toBe(5);
  });

  it('returns isPaused=true when MAX_CONSECUTIVE_DRIFT exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await tracker.recordDrift(1, -15_000_000n);
    }
    const state = tracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(state.consecutiveDrift).toBe(3);
  });

  it('resumes chain and clears counters', async () => {
    for (let i = 0; i < 5; i++) await tracker.record(1, 'reverted');
    await tracker.resume(1);
    const state = tracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveDrift).toBe(0);
    expect(mockRedis.del).toHaveBeenCalledWith('fr:pause:1');
  });
});
