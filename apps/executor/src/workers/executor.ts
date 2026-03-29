import Redis from 'ioredis';
import { RedisSubscriber } from '../channels/redis-subscriber';
import { TradeQueuePublisher } from '../channels/trade-queue-publisher';
import { NonceManager } from '../modules/execution/nonce-manager';
import { TxTracker } from '../modules/execution/tx-tracker';
import { ExecutionEngine } from '../services/execution-engine';
import { SafetyService } from '../modules/safety/safety-service';
import { FailureTracker } from '../modules/safety/failure-tracker';
import { AlertPublisher } from '../modules/safety/alert-publisher';
import { HealthMonitor } from '../modules/safety/health-monitor';
import { RuntimeConfigSubscriber } from '../modules/safety/runtime-config-subscriber';
import { loadExecutionConfig, type ExecutionConfig } from '../config/execution.config';
import { createRedisClients, checkRedisHealth } from '@flashroute/db/redis';
import { createLogger, REDIS_CHANNELS } from '@flashroute/shared';
import { ethers } from 'ethers';

export interface DiscoveredRoute {
  id: string;
  chainId: number;
  hops: Array<{
    dexType: number;
    router: string;
    tokenIn: string;
    tokenOut: string;
    amountIn?: bigint;
    sqrtPriceLimitX96?: bigint;
  }>;
  provider: string;
  token: string;
  vault: string;
  amount: bigint;
  minProfit?: bigint;
  simulatedAt: number;
  profitUsd?: number;
}

interface Strategy {
  id: string;
  chainId: number;
  tokens: string[];
  minProfitUsd: number;
  maxGasPriceGwei: number;
}

export class ExecutorWorker {
  private readonly config: ExecutionConfig;
  private readonly redisSubscriber: RedisSubscriber;
  private readonly cacheClient: Redis;
  private readonly executionEngine: ExecutionEngine;
  private readonly tradeQueuePublisher: TradeQueuePublisher;
  private readonly safetyService: SafetyService;
  private readonly healthMonitor: HealthMonitor;
  private readonly runtimeConfigSubscriber: RuntimeConfigSubscriber;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(
    config: ExecutionConfig,
    cacheClient: Redis,
    executionEngine: ExecutionEngine,
    redisClients: Awaited<ReturnType<typeof createRedisClients>>,
  ) {
    this.config = config;
    this.cacheClient = cacheClient;
    this.redisSubscriber = new RedisSubscriber();
    this.executionEngine = executionEngine;
    this.tradeQueuePublisher = new TradeQueuePublisher();
    this.logger = createLogger('executor-worker');

    const failureTracker = new FailureTracker(cacheClient);
    const alertPublisher = new AlertPublisher(redisClients.publisher as Redis);
    this.healthMonitor = new HealthMonitor(
      cacheClient,
      (chainId, unhealthy) => this.safetyService?.setChainHealthy(chainId, unhealthy)
    );
    this.runtimeConfigSubscriber = new RuntimeConfigSubscriber(
      redisClients.subscriber as Redis,
      (paused) => this.safetyService?.setGlobalPaused(paused)
    );
    this.safetyService = new SafetyService(
      config,
      failureTracker,
      this.healthMonitor,
      alertPublisher,
      false
    );
  }

  async start(): Promise<void> {
    this.logger.info({ enabled: this.config.enabled }, 'Starting executor worker');

    const health = await checkRedisHealth(this.cacheClient);
    if (health.status === 'unhealthy') {
      throw new Error(`Redis health check failed: ${JSON.stringify(health.details)}`);
    }

    await this.runtimeConfigSubscriber.start();
    this.healthMonitor.start();
    await this.safetyService.recoverFromRedis();

    await this.redisSubscriber.subscribe(
      REDIS_CHANNELS.routeDiscovered,
      this.handleRouteDiscovered.bind(this)
    );

    this.logger.info('Executor worker started');
  }

  async handleRouteDiscovered(message: string): Promise<void> {
    let route: DiscoveredRoute;
    try {
      route = JSON.parse(message);
    } catch {
      this.logger.warn({ message }, 'Failed to parse route discovery message');
      return;
    }

    this.logger.debug(
      { routeId: route.id, chainId: route.chainId },
      'Route discovered'
    );

    if (!this.config.enabled) {
      this.logger.info(
        { routeId: route.id },
        '[SIMULATED] Would execute route (EXECUTION_ENABLED=false)'
      );
      return;
    }

    const safetyDecision = await this.safetyService.shouldExecute(route);
    if (!safetyDecision.allowed) {
      this.logger.info(
        { routeId: route.id, reason: safetyDecision.reason },
        'Safety check blocked execution'
      );
      return;
    }

    const strategy = this.findMatchingStrategy(route);
    if (!strategy) {
      this.logger.debug({ routeId: route.id }, 'No matching strategy');
      return;
    }

    try {
      const result = await this.executionEngine.execute(route, strategy);
      await this.safetyService.recordResult(route.chainId, result);
      this.logger.info(
        { routeId: route.id, status: result.status, reason: result.reason },
        'Execution complete'
      );
    } catch (err) {
      this.logger.error({ err, routeId: route.id }, 'Execution failed');
    }
  }

  private findMatchingStrategy(route: DiscoveredRoute): Strategy | null {
    return {
      id: 'strategy-default',
      chainId: route.chainId,
      tokens: [route.token],
      minProfitUsd: 10,
      maxGasPriceGwei: 100,
    };
  }

  async stop(): Promise<void> {
    this.healthMonitor.stop();
    await this.runtimeConfigSubscriber.close();
    await this.redisSubscriber.close();
    this.logger.info('Executor worker stopped');
  }
}

function createCacheClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new Redis(url, {
    db: 0,
    keyPrefix: 'fr:',
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

async function main(): Promise<void> {
  const config = loadExecutionConfig();

  const cacheClient = createCacheClient();
  const redisClients = createRedisClients(
    {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      cacheDb: 0,
      pubSubDb: 1,
      queueDb: 2,
      keyPrefix: 'fr:',
      queuePrefix: 'fr:queue:',
    },
    (url, options) => new Redis(url, options)
  );

  const tradeQueuePublisher = new TradeQueuePublisher();

  const executionEngine = new ExecutionEngine(
    config,
    new NonceManager(cacheClient),
    new TxTracker(new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL ?? 'http://localhost:8545'
    )),
    tradeQueuePublisher,
    cacheClient,
    {
      1: process.env.ETHEREUM_RPC_URL ?? 'http://localhost:8545',
      42161: process.env.ARBITRUM_RPC_URL ?? 'http://localhost:8547',
    }
  );

  await executionEngine.initialize();

  const worker = new ExecutorWorker(config, cacheClient, executionEngine, redisClients);

  process.on('SIGINT', async () => {
    await worker.stop();
    await cacheClient.quit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    await cacheClient.quit();
    process.exit(0);
  });

  await worker.start();
}

if (!process.env.VITEST) {
  main().catch((err) => {
    console.error('Executor worker failed:', err);
    process.exit(1);
  });
}
