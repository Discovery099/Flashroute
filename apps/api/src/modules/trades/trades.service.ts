import { ApiError } from '../../app';
import type { TradeHopRecord, TradeRecord, TradesRepository } from './trades.repository';
import type { ListTradesQuery, TradeSummaryQuery } from './trades.schemas';

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  detected: ['simulated'],
  simulated: ['submitted_private', 'submitted_public'],
  submitted_private: ['submitted_public', 'failed'],
  submitted_public: ['included', 'failed'],
  included: ['settled', 'reverted'],
  settled: [],
  reverted: [],
  failed: [],
};

export class TradesService {
  public constructor(private readonly tradesRepository: TradesRepository) {}

  public async create(input: {
    strategyId: string;
    userId: string;
    chainId: number;
    routePath: unknown;
    routeHops: number;
    flashLoanProvider: string;
    flashLoanToken: string;
    flashLoanAmount: number;
    flashLoanFee: number;
    simulatedProfitUsd: number;
    demandPredictionUsed: boolean;
    executionTimeMs: number;
  }) {
    const trade = await this.tradesRepository.create(input);
    return { trade: this.toTradeDto(trade), hops: [] as TradeHopRecord[] };
  }

  public async addHops(tradeId: string, userId: string, hops: Array<{
    hopIndex: number;
    poolId: string;
    tokenInId: string;
    tokenOutId: string;
    amountIn: number;
    amountOut: number;
    expectedAmountOut: number;
    slippagePct?: number;
  }>) {
    const trade = await this.tradesRepository.findById(userId, tradeId);
    if (!trade) {
      throw new ApiError(404, 'NOT_FOUND', 'Trade not found');
    }
    const createdHops = await this.tradesRepository.addHops(tradeId, hops);
    return { hops: createdHops.map(this.toTradeHopDto) };
  }

  public async getById(userId: string, tradeId: string) {
    const trade = await this.tradesRepository.findById(userId, tradeId);
    if (!trade) {
      throw new ApiError(404, 'NOT_FOUND', 'Trade not found');
    }
    return { trade: this.toTradeDto(trade), hops: [] as TradeHopRecord[] };
  }

  public async list(userId: string, query: ListTradesQuery) {
    const filters = {
      chainId: query.chainId,
      strategyId: query.strategyId,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      minProfitUsd: query.minProfitUsd,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    };
    const result = await this.tradesRepository.listByUser(userId, filters);
    return {
      trades: result.trades.map((trade) => this.toTradeDto(trade)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
      },
    };
  }

  public async getSummary(userId: string, query: TradeSummaryQuery) {
    const filters = {
      chainId: query.chainId,
      strategyId: query.strategyId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };
    return this.tradesRepository.getSummary(userId, filters);
  }

  public async updateStatus(
    userId: string,
    tradeId: string,
    newStatus: string,
    details?: {
      txHash?: string;
      blockNumber?: bigint;
      profitRaw?: number;
      profitUsd?: number;
      gasUsed?: bigint;
      gasPriceGwei?: number;
      gasCostUsd?: number;
      netProfitUsd?: number;
      slippagePct?: number;
      competingTxsInBlock?: number;
      errorMessage?: string;
      submittedAt?: Date;
      confirmedAt?: Date;
    },
  ) {
    const trade = await this.tradesRepository.findById(userId, tradeId);
    if (!trade) {
      throw new ApiError(404, 'NOT_FOUND', 'Trade not found');
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[trade.status] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${trade.status} to ${newStatus}`);
    }

    const updated = await this.tradesRepository.updateStatus(tradeId, newStatus, details);
    return { trade: this.toTradeDto(updated), hops: [] as TradeHopRecord[] };
  }

  private toTradeDto(trade: TradeRecord) {
    return {
      id: trade.id,
      strategyId: trade.strategyId,
      strategyName: trade.strategy?.name ?? null,
      chainId: trade.chainId,
      chainName: trade.chain?.name ?? null,
      status: trade.status,
      txHash: trade.txHash,
      blockNumber: trade.blockNumber !== null ? Number(trade.blockNumber) : null,
      routePath: trade.routePath,
      routeHops: trade.routeHops,
      flashLoanProvider: trade.flashLoanProvider,
      flashLoanToken: trade.flashLoanToken,
      flashLoanAmount: trade.flashLoanAmount,
      flashLoanFee: trade.flashLoanFee,
      profitRaw: trade.profitRaw,
      profitUsd: trade.profitUsd,
      gasUsed: trade.gasUsed !== null ? Number(trade.gasUsed) : null,
      gasPriceGwei: trade.gasPriceGwei,
      gasCostUsd: trade.gasCostUsd,
      netProfitUsd: trade.netProfitUsd,
      simulatedProfitUsd: trade.simulatedProfitUsd,
      slippagePct: trade.slippagePct,
      demandPredictionUsed: trade.demandPredictionUsed,
      competingTxsInBlock: trade.competingTxsInBlock,
      errorMessage: trade.errorMessage,
      executionTimeMs: trade.executionTimeMs,
      submittedAt: trade.submittedAt?.toISOString() ?? null,
      confirmedAt: trade.confirmedAt?.toISOString() ?? null,
      createdAt: trade.createdAt.toISOString(),
    };
  }

  private toTradeHopDto(hop: TradeHopRecord) {
    return {
      id: hop.id,
      tradeId: hop.tradeId,
      hopIndex: hop.hopIndex,
      poolId: hop.poolId,
      tokenInId: hop.tokenInId,
      tokenOutId: hop.tokenOutId,
      amountIn: hop.amountIn,
      amountOut: hop.amountOut,
      expectedAmountOut: hop.expectedAmountOut,
      slippagePct: hop.slippagePct,
      createdAt: hop.createdAt.toISOString(),
      pool: hop.pool,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
    };
  }
}
