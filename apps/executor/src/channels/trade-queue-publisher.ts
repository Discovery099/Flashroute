import { createRedisClients } from '@flashroute/db/redis';
import { createLogger, REDIS_CHANNELS } from '@flashroute/shared';
import Redis from 'ioredis';

export interface TradeCreateMessage {
  type: 'create' | 'update';
  tradeId?: string;
  payload: Record<string, unknown>;
}

export class TradeQueuePublisher {
  private readonly publisher: Redis;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.publisher = new Redis(url, {
      db: 1,
      keyPrefix: 'fr:',
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.logger = createLogger('trade-queue-publisher');
  }

  async publishCreateTrade(payload: Record<string, unknown>): Promise<string> {
    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message: TradeCreateMessage = {
      type: 'create',
      tradeId,
      payload,
    };
    await this.publisher.lpush(REDIS_CHANNELS.tradesQueue, JSON.stringify(message));
    this.logger.debug({ tradeId }, 'Published trade create message');
    return tradeId;
  }

  async publishUpdateTrade(tradeId: string, payload: Record<string, unknown>): Promise<void> {
    const message: TradeCreateMessage = {
      type: 'update',
      tradeId,
      payload,
    };
    await this.publisher.lpush(REDIS_CHANNELS.tradesQueue, JSON.stringify(message));
    this.logger.debug({ tradeId }, 'Published trade update message');
  }

  async close(): Promise<void> {
    await this.publisher.quit();
    this.logger.info('TradeQueuePublisher closed');
  }
}
