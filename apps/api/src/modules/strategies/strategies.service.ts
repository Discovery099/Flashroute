import { ApiError } from '../../app';
import type { AuthRepository } from '../auth/auth.repository';
import type { RequestContext } from '../auth/auth.service';
import { REDIS_CHANNELS } from '@flashroute/shared/constants';
import {
  supportedDexesByChainId,
  type CreateStrategyInput,
  type ListStrategiesQuery,
  type UpdateStrategyInput,
} from './strategies.schemas';
import type { StrategiesRepository, StrategyListFilters, StrategyRecord } from './strategies.repository';

interface StrategyEventPublisher { publish(channel: string, payload: string): Promise<number>; }

const maxStrategiesByRole = {
  monitor: 2,
  trader: 10,
  executor: 25,
  institutional: Number.POSITIVE_INFINITY,
  admin: Number.POSITIVE_INFINITY,
} as const;

const activeStatuses = new Set(['active', 'trialing']);

export class StrategiesService {
  public constructor(
    private readonly authRepository: AuthRepository,
    private readonly strategiesRepository: StrategiesRepository,
    private readonly eventPublisher?: StrategyEventPublisher,
  ) {}

  public async create(userId: string, input: CreateStrategyInput, context?: RequestContext) {
    const user = await this.requireStrategyUser(userId);
    const chain = await this.requireSupportedChain(input.chainId, true);
    const allowedDexes = input.allowedDexes ?? [...supportedDexesByChainId[input.chainId]];
    this.assertSupportedDexes(input.chainId, allowedDexes);

    const existingCount = await this.strategiesRepository.countByUser(userId);
    if (existingCount >= maxStrategiesByRole[user.role]) {
      throw new ApiError(403, 'TIER_LIMIT', 'Strategy limit reached for the current plan');
    }

    const strategy = await this.strategiesRepository.create({
      userId,
      name: input.name,
      description: input.description,
      chainId: chain.chainId,
      minProfitUsd: input.minProfitUsd,
      maxTradeSizeUsd: input.maxTradeSizeUsd,
      maxHops: input.maxHops,
      maxSlippageBps: input.maxSlippageBps,
      cooldownSeconds: input.cooldownSeconds,
      allowedDexes,
      flashLoanProvider: input.flashLoanProvider,
      useFlashbots: input.useFlashbots,
      maxGasPriceGwei: input.maxGasPriceGwei,
      riskBufferPct: input.riskBufferPct,
      useDemandPrediction: input.useDemandPrediction,
    });
    await this.audit(userId, 'strategy.create', strategy.id, { chainId: strategy.chainId }, context);
    return this.toStrategyDto(strategy);
  }

  public async list(userId: string, query: ListStrategiesQuery) {
    const status: StrategyListFilters['status'] = query.isActive === undefined
      ? 'all'
      : (query.isActive ? 'active' : 'paused');
    const filters: StrategyListFilters = {
      chainId: query.chainId,
      status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    };
    const result = await this.strategiesRepository.listByUser(userId, filters);

    return {
      strategies: result.strategies.map((strategy) => this.toStrategyDto(strategy)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }

  public async getById(userId: string, strategyId: string) {
    const strategy = await this.requireOwnedStrategy(userId, strategyId);
    return {
      strategy: this.toStrategyDto(strategy),
      performance: {
        executionCount: strategy.executionCount,
        totalProfitUsd: strategy.totalProfitUsd,
        successRate: 0,
        averageProfitUsd: strategy.executionCount > 0 ? strategy.totalProfitUsd / strategy.executionCount : 0,
        bestTradeUsd: 0,
      },
    };
  }

  public async update(userId: string, strategyId: string, input: UpdateStrategyInput, context?: RequestContext) {
    await this.requireStrategyUser(userId);
    if ('chainId' in input) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid input data', [{ field: 'chainId', message: 'Strategy chainId cannot be changed after creation' }]);
    }
    const strategy = await this.requireOwnedStrategy(userId, strategyId);
    const nextAllowedDexes = input.allowedDexes ?? strategy.allowedDexes;
    this.assertSupportedDexes(strategy.chainId, nextAllowedDexes);

    const updated = await this.strategiesRepository.update(strategy.id, {
      name: input.name,
      description: input.description,
      minProfitUsd: input.minProfitUsd,
      maxTradeSizeUsd: input.maxTradeSizeUsd,
      maxHops: input.maxHops,
      maxSlippageBps: input.maxSlippageBps,
      cooldownSeconds: input.cooldownSeconds,
      allowedDexes: input.allowedDexes,
      flashLoanProvider: input.flashLoanProvider,
      useFlashbots: input.useFlashbots,
      maxGasPriceGwei: input.maxGasPriceGwei,
      riskBufferPct: input.riskBufferPct,
      useDemandPrediction: input.useDemandPrediction,
      isActive: false,
    });
    await this.audit(userId, 'strategy.update', strategy.id, { autoDeactivated: true }, context);
    return this.toStrategyDto(updated);
  }

  public async activate(userId: string, strategyId: string, context?: RequestContext) {
    await this.requireStrategyUser(userId);
    const strategy = await this.requireOwnedStrategy(userId, strategyId);
    const chain = await this.requireSupportedChain(strategy.chainId, true);
    const updated = await this.strategiesRepository.update(strategy.id, { isActive: true });
    await this.eventPublisher?.publish(REDIS_CHANNELS.strategyActivated, JSON.stringify({ strategyId: strategy.id, chainId: chain.chainId }));
    await this.audit(userId, 'strategy.activate', strategy.id, {}, context);
    return this.toStrategyDto(updated);
  }

  public async deactivate(userId: string, strategyId: string, context?: RequestContext) {
    await this.requireStrategyUser(userId);
    const strategy = await this.requireOwnedStrategy(userId, strategyId);
    const updated = await this.strategiesRepository.update(strategy.id, { isActive: false });
    await this.eventPublisher?.publish(REDIS_CHANNELS.strategyDeactivated, JSON.stringify({ strategyId: strategy.id, chainId: strategy.chainId }));
    await this.audit(userId, 'strategy.deactivate', strategy.id, {}, context);
    return this.toStrategyDto(updated);
  }

  public async delete(userId: string, strategyId: string, confirmed: boolean, context?: RequestContext) {
    await this.requireStrategyUser(userId);
    if (!confirmed) {
      throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Strategy deletion requires explicit confirmation');
    }

    const strategy = await this.requireOwnedStrategy(userId, strategyId);
    await this.strategiesRepository.delete(strategy.id);
    await this.audit(userId, 'strategy.delete', strategy.id, {}, context);
  }

  private async requireStrategyUser(userId: string) {
    const user = await this.authRepository.findUserById(userId);
    if (!user || user.deletedAt) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found');
    }
    if (!user.subscription || !activeStatuses.has(user.subscription.status)) {
      throw new ApiError(403, 'TIER_LIMIT', 'An active subscription is required to manage strategies');
    }
    return user;
  }

  private async requireOwnedStrategy(userId: string, strategyId: string) {
    const strategy = await this.strategiesRepository.findById(userId, strategyId);
    if (!strategy) {
      throw new ApiError(404, 'NOT_FOUND', 'Strategy not found');
    }
    return strategy;
  }

  private assertSupportedDexes(chainId: number, allowedDexes: string[]) {
    const supportedDexes = new Set(supportedDexesByChainId[chainId] ?? []);
    const unsupported = allowedDexes.filter((dex) => !supportedDexes.has(dex as never));
    if (unsupported.length > 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid input data', unsupported.map((dex) => ({ field: 'allowedDexes', message: `${dex} is not supported on chain ${chainId}` })));
    }
  }

  private async requireSupportedChain(chainId: number, requireExecutorContract = false) {
    const chain = await this.strategiesRepository.getChain(chainId);
    if (!chain || !chain.isActive || (requireExecutorContract && !chain.executorContractAddress)) {
      throw new ApiError(404, 'NOT_FOUND', 'Supported chain not available for strategy execution');
    }
    return chain;
  }

  private async audit(userId: string, action: string, strategyId: string, details: Record<string, unknown>, context?: RequestContext) {
    await this.authRepository.createAuditLog({
      userId,
      action,
      resourceType: 'strategy',
      resourceId: strategyId,
      details,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      requestId: context?.requestId ?? null,
    });
  }

  private toStrategyDto(strategy: StrategyRecord) {
    return {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      chainId: strategy.chainId,
      isActive: strategy.isActive,
      minProfitUsd: strategy.minProfitUsd,
      maxTradeSizeUsd: strategy.maxTradeSizeUsd,
      maxHops: strategy.maxHops,
      cooldownSeconds: strategy.cooldownSeconds,
      riskBufferPct: strategy.riskBufferPct,
      maxGasPriceGwei: strategy.maxGasPriceGwei,
      maxSlippageBps: strategy.maxSlippageBps,
      allowedDexes: strategy.allowedDexes,
      flashLoanProvider: strategy.flashLoanProvider,
      useFlashbots: strategy.useFlashbots,
      useDemandPrediction: strategy.useDemandPrediction,
      executionCount: strategy.executionCount,
      totalProfitUsd: strategy.totalProfitUsd,
      lastRunAt: null,
      createdAt: strategy.createdAt.toISOString(),
      updatedAt: strategy.updatedAt.toISOString(),
    };
  }
}
