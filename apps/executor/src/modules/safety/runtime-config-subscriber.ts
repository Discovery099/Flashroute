import type { Redis } from 'ioredis';
import { createLogger } from '@flashroute/shared';

const CONFIG_CHANNEL = 'fr:config:changed';
const PAUSE_KEYS = new Set(['execution_paused', 'maintenance_mode']);

export class RuntimeConfigSubscriber {
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(
    private readonly subscriber: Redis,
    private readonly onPauseChange: (paused: boolean) => void
  ) {
    this.logger = createLogger('runtime-config-subscriber');
  }

  async start(): Promise<void> {
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== CONFIG_CHANNEL) return;

      try {
        const { key, value } = JSON.parse(message);

        if (!PAUSE_KEYS.has(key)) return;

        const shouldPause = value === true;
        this.onPauseChange(shouldPause);
        this.logger.info({ key, value, paused: shouldPause }, 'Runtime config pause update');
      } catch (err) {
        this.logger.warn({ err, message }, 'Failed to parse config change message');
      }
    });

    await this.subscriber.subscribe(CONFIG_CHANNEL);
    this.logger.info({}, 'Subscribed to runtime config changes');
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    this.logger.info({}, 'RuntimeConfigSubscriber closed');
  }
}
