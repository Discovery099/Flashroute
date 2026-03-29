import { createLogger } from '@flashroute/shared';
import { closeAllQueues, closeAllWorkers } from './queues/queue.js';
import { startScheduler, stopScheduler } from './queues/scheduler.js';
import { startHeartbeat, stopHeartbeat } from './queues/heartbeat.js';
import { registerProcessors, prisma } from './jobs/index.js';
import { TradeQueueProcessor } from './modules/trade-queue.processor.js';
import { TradeApiClient } from './modules/trade-api.client.js';
import { getRedisConnection } from './queues/connection.js';

const logger = createLogger('jobs-worker');

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutdown signal received');

  try {
    await stopScheduler();
    await stopHeartbeat();
    await closeAllWorkers();
    await closeAllQueues();
    await tradeQueueProcessor.stop();
    await prisma.$disconnect();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, 'Error during shutdown');
    process.exit(1);
  }
};

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const tradeQueueProcessor = new TradeQueueProcessor(getRedisConnection(), new TradeApiClient(API_URL), logger);

const bootstrap = async (): Promise<void> => {
  logger.info('Starting jobs-worker...');

  registerProcessors();

  startHeartbeat();
  startScheduler();
  tradeQueueProcessor.start().catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, 'TradeQueueProcessor error');
  });

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  logger.info('Jobs worker is running');
};

bootstrap().catch((err) => {
  logger.error({ error: err instanceof Error ? err.message : 'Unknown' }, 'Failed to start jobs-worker');
  process.exit(1);
});
