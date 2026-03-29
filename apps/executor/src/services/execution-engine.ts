import { ethers } from 'ethers';
import type { Redis } from 'ioredis';
import { FlashbotsRelay } from '../modules/execution/relay/flashbots-relay';
import { SequencerRelay } from '../modules/execution/relay/sequencer-relay';
import type { IRelayProvider } from '../modules/execution/relay/relay-provider';
import { NonceManager } from '../modules/execution/nonce-manager';
import { TxTracker } from '../modules/execution/tx-tracker';
import { encodeRouteParams, type RouteParamsStruct } from '../modules/execution/transaction-builder';
import type { ExecutionConfig } from '../config/execution.config';
import { createLogger } from '@flashroute/shared';

export interface ExecutionDecision {
  approved: boolean;
  reasons: string[];
}

export interface ExecutionResult {
  tradeId?: string;
  txHash?: string;
  status: 'skipped' | 'submitted' | 'included' | 'reverted' | 'failed';
  reason?: string;
  error?: string;
}

export interface TradeService {
  createTrade(payload: Record<string, unknown>): Promise<{ id: string }>;
  updateTrade(tradeId: string, payload: Record<string, unknown>): Promise<void>;
}

export class ExecutionEngine {
  private wallet: ethers.Wallet;
  private providers = new Map<number, ethers.JsonRpcProvider>();
  private relays = new Map<number, IRelayProvider>();
  private logger: ReturnType<typeof createLogger>;

  constructor(
    private readonly config: ExecutionConfig,
    private readonly nonceManager: NonceManager,
    private readonly txTracker: TxTracker,
    private readonly tradeService: TradeService,
    private readonly redis: Redis,
    private readonly rpcEndpoints: Record<number, string>
  ) {
    this.logger = createLogger('execution-engine');
    this.wallet = new ethers.Wallet(config.privateKey);

    for (const [chainId, endpoint] of Object.entries(rpcEndpoints)) {
      const chainIdNum = parseInt(chainId);
      const provider = new ethers.JsonRpcProvider(endpoint);
      this.providers.set(chainIdNum, provider);

      if (chainIdNum === 1) {
        const relay = new FlashbotsRelay({ rpcEndpoint: endpoint, relayUrl: config.flashbotsRelayUrl });
        this.relays.set(chainIdNum, relay);
      } else {
        const relay = new SequencerRelay({ rpcEndpoint: endpoint, wallet: this.wallet });
        this.relays.set(chainIdNum, relay);
      }
    }
  }

  async initialize(): Promise<void> {
    for (const [, relay] of this.relays.entries()) {
      if (relay instanceof FlashbotsRelay) {
        await relay.initialize(this.wallet);
      }
    }
  }

  async shouldExecute(route: { simulatedAt: number; chainId: number }, strategy: { maxGasPriceGwei?: number }): Promise<ExecutionDecision> {
    const reasons: string[] = [];

    if (!this.config.enabled) {
      reasons.push('execution_disabled');
    }

    const age = Date.now() - route.simulatedAt;
    if (age > this.config.stalenessThresholdMs) {
      reasons.push(`stale_opportunity: simulation is ${age}ms old (max ${this.config.stalenessThresholdMs}ms)`);
    }

    const provider = this.providers.get(route.chainId);
    if (!provider) {
      reasons.push(`unknown_chain: ${route.chainId}`);
    }

    return {
      approved: reasons.length === 0,
      reasons,
    };
  }

  async execute(
    route: {
      id: string;
      chainId: number;
      hops: Array<{ dexType: number; router: string; tokenIn: string; tokenOut: string; amountIn?: bigint; sqrtPriceLimitX96?: bigint }>;
      provider: string;
      token: string;
      vault: string;
      amount: bigint;
      minProfit?: bigint;
      simulatedAt: number;
    },
    strategy: { id: string; maxGasPriceGwei?: number }
  ): Promise<ExecutionResult> {
    const chainId = route.chainId;

    const decision = await this.shouldExecute(route, strategy);
    if (!decision.approved) {
      this.logger.info({ routeId: route.id, reasons: decision.reasons }, 'Execution skipped');
      return { status: 'skipped', reason: decision.reasons.join('; ') };
    }

    const lockKey = `fr:lock:execution:${strategy.id}:${chainId}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!lockAcquired) {
      return { status: 'skipped', reason: 'execution_lock_held' };
    }

    let nonce: number | undefined;
    try {
      nonce = await this.nonceManager.reserveNonce(chainId);

      const routeParams: RouteParamsStruct = {
        flashLoanProvider: route.provider === 'balancer' ? 1 : 2,
        flashLoanToken: route.token,
        flashLoanVault: route.vault,
        flashLoanAmount: route.amount,
        minProfit: route.minProfit ?? 0n,
        deadline: Math.floor(Date.now() / 1000) + 300,
        hops: route.hops.map((hop) => ({
          dexType: hop.dexType,
          router: hop.router,
          tokenIn: hop.tokenIn,
          tokenOut: hop.tokenOut,
          amountIn: hop.amountIn ?? 0n,
          sqrtPriceLimitX96: hop.sqrtPriceLimitX96 ?? 0n,
        })),
      };

      const callData = encodeRouteParams(routeParams);
      const executorAddress = this.getExecutorAddress(chainId);
      const provider = this.providers.get(chainId)!;
      const feeData = await provider.getFeeData();

      const txRequest: ethers.TransactionRequest = {
        to: executorAddress,
        data: ethers.hexlify(callData),
        nonce,
        chainId,
        value: 0n,
        gasLimit: this.estimateGas(route),
        maxFeePerGas: feeData.maxFeePerGas ?? 50_000_000_000n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 2_000_000_000n,
      };

      const signedTx = await this.wallet.signTransaction(txRequest);

      const relay = this.relays.get(chainId)!;
      const currentBlock = await provider.getBlockNumber();
      const targets = [
        { blockNumber: currentBlock + 1 },
        { blockNumber: currentBlock + 2 },
      ];

      if (relay instanceof FlashbotsRelay) {
        const sim = await relay.simulate(signedTx, currentBlock + 1, ethers.ZeroAddress);
        if (!sim.success) {
          await this.nonceManager.releaseNonce(chainId, nonce);
          return { status: 'failed', reason: 'simulation_revert', error: sim.reason };
        }
      }

      const hashMap = await relay.submitWithTargets(targets, signedTx);
      const primaryHash = hashMap.get(currentBlock + 1) ?? hashMap.get(currentBlock + 2)!;

      const trade = await this.tradeService.createTrade({
        strategyId: strategy.id,
        chainId,
        status: 'submitted',
        routePath: route.hops.map((h) => h.router).join('→'),
        flashLoanProvider: route.provider,
        flashLoanToken: route.token,
        flashLoanAmount: route.amount.toString(),
      });

      const relayResult = relay instanceof FlashbotsRelay
        ? await relay.waitForInclusion(primaryHash, 3)
        : await relay.waitForInclusion(primaryHash, 25);

      if (relayResult.success) {
        await this.tradeService.updateTrade(trade.id, {
          status: 'included',
          txHash: relayResult.txHash,
          blockNumber: relayResult.blockNumber,
        });
        return { tradeId: trade.id, txHash: relayResult.txHash, status: 'included' };
      } else {
        await this.tradeService.updateTrade(trade.id, {
          status: 'failed',
          errorMessage: relayResult.error ?? relayResult.reason,
        });
        return { tradeId: trade.id, status: 'failed', reason: relayResult.reason };
      }
    } catch (err) {
      this.logger.error({ err, routeId: route.id }, 'Execution error');
      if (nonce !== undefined) {
        await this.nonceManager.releaseNonce(chainId, nonce);
      }
      return { status: 'failed', error: String(err) };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private getExecutorAddress(chainId: number): string {
    const addresses: Record<number, string> = {
      1: '0x0000000000000000000000000000000000000001',
      42161: '0x0000000000000000000000000000000000000001',
    };
    return addresses[chainId] ?? '0x0000000000000000000000000000000000000001';
  }

  private estimateGas(route: { hops: Array<unknown> }): bigint {
    const baseGas = 21_000n;
    const hopGas = 150_000n * BigInt(route.hops.length);
    const flashLoanGas = 40_000n;
    return baseGas + hopGas + flashLoanGas + 50_000n;
  }
}
