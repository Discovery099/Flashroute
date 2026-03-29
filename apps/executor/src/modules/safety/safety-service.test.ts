import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyService } from './safety-service';

describe('SafetyService', () => {
  let mockFailureTracker: any;
  let mockHealthMonitor: any;
  let mockAlertPublisher: any;
  let safetyService: SafetyService;

  beforeEach(() => {
    mockFailureTracker = {
      getState: vi.fn().mockReturnValue({ consecutiveFailures: 0, consecutiveDrift: 0, isPaused: false }),
      record: vi.fn(),
      recordDrift: vi.fn(),
      recordNonNegativeProfit: vi.fn(),
      resume: vi.fn(),
      recoverFromRedis: vi.fn().mockResolvedValue(new Map()),
    };
    mockHealthMonitor = {
      isChainHealthy: vi.fn().mockReturnValue(true),
    };
    mockAlertPublisher = {
      publishAutoPause: vi.fn(),
    };

    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1, 42161], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      mockAlertPublisher,
      false
    );
  });

  it('allows execution when all gates pass', async () => {
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(true);
  });

  it('blocks when EXECUTION_ENABLED=false', async () => {
    safetyService = new SafetyService(
      { enabled: false, privateKey: '', chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      mockAlertPublisher,
      false
    );
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('execution_disabled');
  });

  it('blocks when global paused via runtime config', async () => {
    safetyService = new SafetyService(
      { enabled: true, privateKey: '0x' + 'a'.repeat(64), chains: [1], stalenessThresholdMs: 6000, gasReserveEth: 0.05, maxPendingPerChain: 1, flashbotsRelayUrl: '' },
      mockFailureTracker,
      mockHealthMonitor,
      mockAlertPublisher,
      true
    );
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('maintenance_mode');
  });

  it('blocks when chain is unhealthy', async () => {
    mockHealthMonitor.isChainHealthy.mockReturnValue(false);
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('unhealthy');
  });

  it('blocks when chain is auto-paused due to failures', async () => {
    mockFailureTracker.getState.mockReturnValue({ consecutiveFailures: 5, consecutiveDrift: 0, isPaused: true, reason: 'consecutive_failures' });
    const route = { id: 'route-1', chainId: 1, simulatedAt: Date.now() };
    const decision = await safetyService.shouldExecute(route as any);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('consecutive_failures');
  });

  it('records included result and resets counters', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'included');
  });

  it('records reverted result and increments failure counter', async () => {
    await safetyService.recordResult(1, { status: 'reverted' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'reverted');
  });

  it('records failed result and increments failure counter', async () => {
    await safetyService.recordResult(1, { status: 'failed' });
    expect(mockFailureTracker.record).toHaveBeenCalledWith(1, 'failed');
  });

  it('records drift on negative actual profit', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' }, -15_000_000n);
    expect(mockFailureTracker.recordDrift).toHaveBeenCalledWith(1, -15_000_000n);
  });

  it('records non-negative profit and resets drift counter', async () => {
    await safetyService.recordResult(1, { status: 'included', txHash: '0xtx' }, 10_000_000n);
    expect(mockFailureTracker.recordNonNegativeProfit).toHaveBeenCalledWith(1);
  });

  it('resumes chain and resets all counters', async () => {
    await safetyService.resumeChain(1);
    expect(mockFailureTracker.resume).toHaveBeenCalledWith(1);
  });

  it('recovers paused chains from Redis on startup', async () => {
    const recovered = new Map([[1, { consecutiveFailures: 5, consecutiveDrift: 0, isPaused: true }]]);
    mockFailureTracker.recoverFromRedis.mockResolvedValue(recovered);
    await safetyService.recoverFromRedis();
    const paused = safetyService.getPausedChains();
    expect(paused.has(1)).toBe(true);
  });
});
