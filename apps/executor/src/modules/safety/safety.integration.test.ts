import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailureTracker } from './failure-tracker';
import { SafetyService } from './safety-service';
import { AlertPublisher } from './alert-publisher';
import { HealthMonitor } from './health-monitor';

describe('SafetyService Integration', () => {
  let mockRedis: any;
  let failureTracker: FailureTracker;
  let mockAlertPublisher: any;
  let mockHealthMonitor: any;
  let safetyService: SafetyService;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    };
    failureTracker = new FailureTracker(mockRedis);
    mockAlertPublisher = { publishAutoPause: vi.fn() };
    mockHealthMonitor = {
      isChainHealthy: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      stop: vi.fn(),
    };
    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1, 42161], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      failureTracker,
      mockHealthMonitor,
      mockAlertPublisher,
      false
    );
  });

  it('drift counter accumulates across multiple included results', async () => {
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    expect((await safetyService.shouldExecute(route)).allowed).toBe(true);

    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx1' }, -15_000_000n);
    let state = failureTracker.getState(1);
    expect(state.consecutiveDrift).toBe(1);

    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx2' }, -15_000_000n);
    state = failureTracker.getState(1);
    expect(state.consecutiveDrift).toBe(2);

    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx3' }, -15_000_000n);
    state = failureTracker.getState(1);
    expect(state.consecutiveDrift).toBe(3);
    expect(state.isPaused).toBe(true);
  });

  it('auto-pauses chain when drift threshold exceeded', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx1' }, -15_000_000n);
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx2' }, -15_000_000n);
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx3' }, -15_000_000n);

    const state = failureTracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(safetyService.getPausedChains().has(1)).toBe(true);
  });

  it('blocks execution on auto-paused chain', async () => {
    for (let i = 0; i < 3; i++) {
      await safetyService.recordResult(1, { status: 'included', txHash: `0xtx${i}` }, -15_000_000n);
    }

    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('chain_paused');
  });

  it('resets drift counter on non-negative profit', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx1' }, -15_000_000n);
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx2' }, 10_000_000n);

    const state = failureTracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
  });

  it('auto-pauses chain after consecutive failures', async () => {
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });

    const state = failureTracker.getState(1);
    expect(state.isPaused).toBe(true);
    expect(safetyService.getPausedChains().has(1)).toBe(true);
  });

  it('publishes alert on auto-pause', async () => {
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });
    await safetyService.recordResult(1, { status: 'reverted' });

    expect(mockAlertPublisher.publishAutoPause).toHaveBeenCalledTimes(1);
    expect(mockAlertPublisher.publishAutoPause).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 1, trigger: 'consecutive_failures' })
    );
  });

  it('recovers paused chains from Redis', async () => {
    mockRedis.keys.mockResolvedValue(['fr:pause:1']);
    mockRedis.get.mockResolvedValue(JSON.stringify({
      chainId: 1,
      consecutiveFailures: 5,
      consecutiveDrift: 0,
      reason: 'consecutive_failures',
      isPaused: true,
      updatedAt: Date.now(),
    }));

    await safetyService.recoverFromRedis();
    expect(safetyService.getPausedChains().has(1)).toBe(true);

    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('chain_paused');
  });

  it('resumes chain and clears paused state', async () => {
    for (let i = 0; i < 5; i++) {
      await safetyService.recordResult(1, { status: 'reverted' });
    }
    expect(safetyService.getPausedChains().has(1)).toBe(true);

    await safetyService.resumeChain(1);
    expect(safetyService.getPausedChains().has(1)).toBe(false);

    const state = failureTracker.getState(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.isPaused).toBe(false);
  });

  it('marks chain unhealthy via setChainHealthy', async () => {
    safetyService.setChainHealthy(1, true);

    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('chain_unhealthy');
  });

  it('restores chain health when setChainHealthy is called with false', async () => {
    safetyService.setChainHealthy(1, true);
    safetyService.setChainHealthy(1, false);

    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route);
    expect(decision.allowed).toBe(true);
  });

  it('global pause blocks all chains regardless of individual health', async () => {
    safetyService.setGlobalPaused(true);

    const route1 = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const route2 = { id: 'route-2', chainId: 42161, simulatedAt: Date.now() };

    expect((await safetyService.shouldExecute(route1)).allowed).toBe(false);
    expect((await safetyService.shouldExecute(route2)).allowed).toBe(false);
  });

  it('non-negative profit resets drift before included record', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx1' }, -15_000_000n);
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx2' }, -15_000_000n);
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx3' }, 5_000_000n);

    let state = failureTracker.getState(1);
    expect(state.consecutiveDrift).toBe(0);
    expect(state.isPaused).toBe(false);
  });
});