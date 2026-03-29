import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

const HEARTBEAT_KEYS = ['fr:heartbeat:pool-indexer', 'fr:heartbeat:analytics-engine'] as const;

export interface HealthMonitorOptions {
  checkIntervalMs?: number;
  staleThresholdMs?: number;
}

export class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private readonly logger: ReturnType<typeof createLogger>;
  private chainHealthy = new Map<number, boolean>();

  constructor(
    private readonly redis: Redis,
    private readonly onHealthChange: (chainId: number, unhealthy: boolean) => void,
    private readonly options: HealthMonitorOptions = {}
  ) {
    this.logger = createLogger('health-monitor');
  }

  start(): void {
    this.logger.info({}, 'HealthMonitor starting');

    this.intervalId = setInterval(() => {
      void this.check();
    }, this.options.checkIntervalMs ?? 10_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.logger.info({}, 'HealthMonitor stopped');
  }

  isChainHealthy(chainId: number): boolean {
    return this.chainHealthy.get(chainId) ?? true;
  }

  private async check(): Promise<void> {
    const staleThresholdMs = this.options.staleThresholdMs ?? 120_000;
    const cutoff = Date.now() - staleThresholdMs;

    try {
      let anyUnhealthy = false;

      for (const key of HEARTBEAT_KEYS) {
        const value = await this.redis.get(key);

        if (value === null) {
          anyUnhealthy = true;
          break;
        }

        const heartbeatTime = new Date(value).getTime();
        if (heartbeatTime < cutoff) {
          anyUnhealthy = true;
          break;
        }
      }

      if (anyUnhealthy) {
        this.handleUnhealthy(1);
      } else {
        this.handleHealthy(1);
      }
    } catch (err) {
      this.logger.error({ err }, 'Health check failed — fail-closing');
      this.handleUnhealthy(1);
    }
  }

  private handleUnhealthy(chainId: number): void {
    const prev = this.chainHealthy.get(chainId);
    this.chainHealthy.set(chainId, false);
    if (prev !== false) {
      this.onHealthChange(chainId, true);
      this.logger.warn({ chainId }, 'Chain marked unhealthy');
    }
  }

  private handleHealthy(chainId: number): void {
    const prev = this.chainHealthy.get(chainId);
    this.chainHealthy.set(chainId, true);
    if (prev === false) {
      this.onHealthChange(chainId, false);
      this.logger.debug({ chainId }, 'Chain health restored');
    }
  }
}
