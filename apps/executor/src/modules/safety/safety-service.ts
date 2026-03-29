import type { ExecutionConfig } from '../../config/execution.config';
import type { FailureTracker } from './failure-tracker';
import type { HealthMonitor } from './health-monitor';
import type { AlertPublisher } from './alert-publisher';
import type { ExecutionResult } from '../../services/execution-engine';
import { createLogger } from '@flashroute/shared';

export interface SafetyDecision {
  allowed: boolean;
  reason?: string;
  chainId: number;
}

export class SafetyService {
  private readonly logger: ReturnType<typeof createLogger>;
  private autoPausedChains = new Set<number>();

  constructor(
    private readonly config: ExecutionConfig,
    private readonly failureTracker: FailureTracker,
    private readonly healthMonitor: HealthMonitor,
    private readonly alertPublisher: AlertPublisher,
    private globalPaused = false
  ) {
    this.logger = createLogger('safety-service');
  }

  setGlobalPaused(paused: boolean): void {
    this.globalPaused = paused;
    this.logger.info({ paused }, 'Global pause state updated');
  }

  async shouldExecute(route: { id: string; chainId: number; simulatedAt: number }): Promise<SafetyDecision> {
    const chainId = route.chainId;

    if (!this.config.enabled) {
      return { allowed: false, reason: 'execution_disabled', chainId };
    }
    if (this.globalPaused) {
      return { allowed: false, reason: 'maintenance_mode', chainId };
    }

    if (!this.healthMonitor.isChainHealthy(chainId)) {
      return { allowed: false, reason: 'chain_unhealthy', chainId };
    }

    if (this.autoPausedChains.has(chainId)) {
      const state = await this.failureTracker.getState(chainId);
      return { allowed: false, reason: `chain_paused:${state.reason ?? 'unknown'}`, chainId };
    }

    const state = await this.failureTracker.getState(chainId);
    if (state.isPaused) {
      this.autoPausedChains.add(chainId);
      return { allowed: false, reason: `chain_paused:${state.reason ?? 'unknown'}`, chainId };
    }

    return { allowed: true, chainId };
  }

  async recordResult(chainId: number, result: ExecutionResult, actualProfit?: bigint): Promise<void> {
    if (result.status === 'included') {
      await this.failureTracker.record(chainId, 'included');
      if (actualProfit !== undefined) {
        if (actualProfit < 0n) {
          await this.failureTracker.recordDrift(chainId, actualProfit);
        } else {
          await this.failureTracker.recordNonNegativeProfit(chainId);
        }
      }
    } else if (result.status === 'reverted' || result.status === 'failed') {
      await this.failureTracker.record(chainId, result.status);
    }

    await this.checkAutoPause(chainId);
  }

  private async checkAutoPause(chainId: number): Promise<void> {
    const state = await this.failureTracker.getState(chainId);
    if (state.isPaused && !this.autoPausedChains.has(chainId)) {
      this.autoPausedChains.add(chainId);
      await this.alertPublisher.publishAutoPause({
        chainId,
        trigger: state.reason as any,
        consecutiveCount: state.consecutiveFailures || state.consecutiveDrift,
        pausedChains: Array.from(this.autoPausedChains),
      });
      this.logger.warn({ chainId, state }, 'Chain auto-paused due to safety threshold');
    }
  }

  getPausedChains(): Set<number> {
    return new Set(this.autoPausedChains);
  }

  async resumeChain(chainId: number): Promise<void> {
    this.autoPausedChains.delete(chainId);
    await this.failureTracker.resume(chainId);
    this.logger.info({ chainId }, 'Chain resumed');
  }

  async recoverFromRedis(): Promise<void> {
    const recovered = await this.failureTracker.recoverFromRedis();
    for (const [chainId, state] of recovered.entries()) {
      if (state.isPaused) {
        this.autoPausedChains.add(chainId);
        this.logger.info({ chainId, state }, 'Recovered paused chain from Redis');
      }
    }
  }
}
