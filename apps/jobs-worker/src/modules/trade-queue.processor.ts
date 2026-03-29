import Redis from 'ioredis';
import { TradeApiClient } from './trade-api.client';
import { REDIS_CHANNELS } from '@flashroute/shared';

const BRPOP_TIMEOUT_SECONDS = 5;
const ERROR_RETRY_DELAY_MS = 1000;

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
        const result = await this.redis.brpop(REDIS_CHANNELS.tradesQueue, BRPOP_TIMEOUT_SECONDS);
        if (result) {
          const [, message] = result;
          await this.processMessage(message);
        }
      } catch (err) {
        this.logger.error({ err }, 'Error in BRPOP loop');
        await sleep(ERROR_RETRY_DELAY_MS);
      }
    }
    this.logger.info({}, 'TradeQueueProcessor stopped');
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async processMessage(rawMessage: string): Promise<void> {
    let parsed: TradeQueueMessage;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.logger.warn({ message: rawMessage }, 'Failed to parse trade queue message — discarding');
      return;
    }

    if (parsed.type === 'create') {
      await this.handleCreate(parsed as TradeCreateMessage, rawMessage);
    } else if (parsed.type === 'update') {
      await this.handleUpdate(parsed as TradeUpdateMessage, rawMessage);
    } else {
      this.logger.warn({ type: (parsed as { type?: string }).type }, 'Unknown message type — discarding');
    }
  }

  private async handleCreate(msg: TradeCreateMessage, rawMessage: string): Promise<void> {
    try {
      const trade = await this.apiClient.createTrade(msg.payload);
      await this.publishTradeUpdate(trade.id, msg.payload);
      this.logger.info({ tradeId: trade.id }, 'Trade created via queue');
    } catch (err) {
      this.logger.error({ err, message: msg }, 'Failed to process create message — re-queuing');
      await this.redis.lpush(REDIS_CHANNELS.tradesQueue, rawMessage);
    }
  }

  private async handleUpdate(msg: TradeUpdateMessage, rawMessage: string): Promise<void> {
    try {
      await this.apiClient.updateTradeStatus(msg.tradeId, msg.payload);
      await this.publishTradeUpdate(msg.tradeId, msg.payload);
      this.logger.info({ tradeId: msg.tradeId }, 'Trade updated via queue');
    } catch (err) {
      this.logger.error({ err, message: msg }, 'Failed to process update message — re-queuing');
      await this.redis.lpush(REDIS_CHANNELS.tradesQueue, rawMessage);
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
    try {
      await this.redis.publish(REDIS_CHANNELS.tradesLive, message);
    } catch (err) {
      this.logger.error({ err, tradeId }, 'Failed to publish trade update to trades:live');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}