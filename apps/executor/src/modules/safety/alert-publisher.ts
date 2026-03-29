import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

export interface AutoPauseAlert {
  chainId: number;
  trigger: 'consecutive_failures' | 'consecutive_drift' | 'heartbeat_stale';
  consecutiveCount: number;
  pausedChains: number[];
}

export class AlertPublisher {
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(private readonly redis: Redis) {
    this.logger = createLogger('alert-publisher');
  }

  async publishAutoPause(alert: AutoPauseAlert): Promise<void> {
    const payload = {
      type: 'auto_pause',
      ...alert,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.redis.publish('fr:system:alert', JSON.stringify(payload));
      this.logger.info({ alert }, 'Published auto-pause alert');
    } catch (err) {
      this.logger.error({ err, alert }, 'Failed to publish auto-pause alert');
    }
  }
}
