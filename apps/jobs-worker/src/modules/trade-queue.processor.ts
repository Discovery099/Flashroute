import Redis from 'ioredis';
import { TradeApiClient } from './trade-api.client';
import { REDIS_CHANNELS } from '@flashroute/shared';

export interface TradeCreateMessage {
  type: 'create';
  tradeId?: string;
  payload: Record<string, unknown>;
}

export interface TradeUpdateMessage {
  type: 'update';
  tradeId: string;
  payload: Record<string, unknown>;
}

export type TradeQueueMessage = TradeCreateMessage | TradeUpdateMessage;

export class TradeQueueProcessor {
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly apiClient: TradeApiClient,
    private readonly logger: { info: Function; error: Function; warn: Function }
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.logger.info({}, 'TradeQueueProcessor started');
    while (this.running) {
      try {
        const result = await this.redis.brpop(REDIS_CHANNELS.tradesQueue, 5);
        if (result) {
          const [, message] = result;
          await this.processMessage(message);
        }
      } catch (err) {
        this.logger.error({ err }, 'Error in BRPOP loop');
        await sleep(1000);
      }
    }
    this.logger.info({}, 'TradeQueueProcessor stopped');
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async processMessage(message: string): Promise<void> {
    let parsed: TradeQueueMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.logger.warn({ message }, 'Failed to parse trade queue message');
      return;
    }

    try {
      if (parsed.type === 'create') {
        const trade = await this.apiClient.createTrade(parsed.payload);
        await this.publishTradeUpdate(trade.id, parsed.payload);
        this.logger.info({ tradeId: trade.id }, 'Trade created via queue');
      } else if (parsed.type === 'update') {
        await this.apiClient.updateTradeStatus(parsed.tradeId, parsed.payload);
        await this.publishTradeUpdate(parsed.tradeId, parsed.payload);
        this.logger.info({ tradeId: parsed.tradeId }, 'Trade updated via queue');
      }
    } catch (err) {
      this.logger.error({ err, message: parsed }, 'Failed to process trade message');
      // Don't rethrow — message stays in list for retry
    }
  }

  private async publishTradeUpdate(
    tradeId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const message = JSON.stringify({
      event: 'trade_update',
      tradeId,
      status: payload.status,
      chainId: payload.chainId,
      profitUsd: payload.profitUsd,
      updatedAt: new Date().toISOString(),
    });
    await this.redis.publish(REDIS_CHANNELS.tradesLive, message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
