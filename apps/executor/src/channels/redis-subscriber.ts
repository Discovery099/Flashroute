import { createLogger } from '@flashroute/shared';
import Redis from 'ioredis';

export class RedisSubscriber {
  private readonly subscriber: Redis;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.subscriber = new Redis(url, {
      db: 1,
      keyPrefix: 'fr:',
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.logger = createLogger('redis-subscriber');
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    this.subscriber.on('message', (ch: string, msg: string) => {
      if (ch === channel) {
        try {
          handler(msg);
        } catch (err) {
          this.logger.error({ err, channel }, 'Error in channel handler');
        }
      }
    });

    await this.subscriber.subscribe(channel);
    this.logger.info({ channel }, 'Subscribed to Redis channel');
  }

  async psubscribe(pattern: string, handler: (channel: string, message: string) => void): Promise<void> {
    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      try {
        handler(channel, message);
      } catch (err) {
        this.logger.error({ err, channel }, 'Error in pchannel handler');
      }
    });

    await this.subscriber.psubscribe(pattern);
    this.logger.info({ pattern }, 'Subscribed to Redis pattern');
  }

  getSubscriberClient(): Redis {
    return this.subscriber;
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    this.logger.info('Redis subscriber closed');
  }
}
