export interface TradeRecord {
  id: string;
  strategyId: string;
  userId: string;
  chainId: number;
  status: string;
  txHash: string | null;
  blockNumber: bigint | null;
  routePath: unknown;
  routeHops: number;
  flashLoanProvider: string;
  flashLoanToken: string;
  flashLoanAmount: number;
  flashLoanFee: number;
  profitRaw: number | null;
  profitUsd: number | null;
  gasUsed: bigint | null;
  gasPriceGwei: number | null;
  gasCostUsd: number | null;
  netProfitUsd: number | null;
  simulatedProfitUsd: number;
  slippagePct: number | null;
  demandPredictionUsed: boolean;
  competingTxsInBlock: number | null;
  errorMessage: string | null;
  executionTimeMs: number;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  chain: { chainId: number; name: string; executorContractAddress: string | null } | null;
  strategy: { id: string; name: string } | null;
}

export interface TradeHopRecord {
  id: string;
  tradeId: string;
  hopIndex: number;
  poolId: string;
  tokenInId: string;
  tokenOutId: string;
  amountIn: number;
  amountOut: number;
  expectedAmountOut: number;
  slippagePct: number | null;
  createdAt: Date;
  pool?: { id: string; address: string; dex: string };
  tokenIn?: { id: string; symbol: string; decimals: number };
  tokenOut?: { id: string; symbol: string; decimals: number };
}

export interface TradeListFilters {
  chainId?: number;
  strategyId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  minProfitUsd?: number;
  sortBy?: 'createdAt' | 'netProfitUsd' | 'gasUsed';
  sortOrder?: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface TradeSummaryFilters {
  chainId?: number;
  strategyId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface TradeSummary {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  successRate: number;
  totalProfitUsd: number;
  totalGasCostUsd: number;
  netProfitUsd: number;
  avgProfitPerTradeUsd: number;
  maxProfitTradeUsd: number;
  avgExecutionTimeMs: number;
  topRoutes: Array<{ path: string; count: number; totalProfit: number }>;
  profitByDay: Array<{ date: string; profit: number; trades: number }>;
}

export interface TradesRepository {
  create(input: CreateTradeRecordInput): Promise<TradeRecord>;
  findById(userId: string, tradeId: string): Promise<({ hops: TradeHopRecord[] } & TradeRecord) | null>;
  listByUser(userId: string, filters: TradeListFilters): Promise<{ trades: TradeRecord[]; total: number }>;
  updateStatus(tradeId: string, status: string, details?: UpdateTradeStatusDetails): Promise<TradeRecord>;
  addHops(tradeId: string, hops: CreateTradeHopRecordInput[]): Promise<TradeHopRecord[]>;
  getSummary(userId: string, filters: TradeSummaryFilters): Promise<TradeSummary>;
}

export interface CreateTradeRecordInput {
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
}

export interface UpdateTradeStatusDetails {
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
}

export interface CreateTradeHopRecordInput {
  hopIndex: number;
  poolId: string;
  tokenInId: string;
  tokenOutId: string;
  amountIn: number;
  amountOut: number;
  expectedAmountOut: number;
  slippagePct?: number;
}

export interface PrismaTradeModel {
  create(args: { data: unknown; include?: unknown }): Promise<unknown>;
  findFirst(args: { where: unknown; include?: unknown }): Promise<unknown | null>;
  findMany(args: { where: unknown; include?: unknown; orderBy?: unknown; skip?: number; take?: number }): Promise<unknown[]>;
  update(args: { where: { id: string }; data: unknown; include?: unknown }): Promise<unknown>;
}

export interface PrismaTradeHopModel {
  create(args: { data: unknown }): Promise<unknown>;
  findMany(args: { where: { tradeId: string } }): Promise<unknown[]>;
}

export interface PrismaTradesClientLike {
  trade: PrismaTradeModel;
  tradeHop: PrismaTradeHopModel;
}

const decimalToNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number(value);
};

const toTradeRecord = (record: any): TradeRecord => ({
  id: record.id,
  strategyId: record.strategyId,
  userId: record.userId,
  chainId: record.chainId,
  status: record.status,
  txHash: record.txHash ?? null,
  blockNumber: record.blockNumber ?? null,
  routePath: record.routePath,
  routeHops: record.routeHops,
  flashLoanProvider: String(record.flashLoanProvider).toLowerCase(),
  flashLoanToken: record.flashLoanToken,
  flashLoanAmount: decimalToNumber(record.flashLoanAmount),
  flashLoanFee: decimalToNumber(record.flashLoanFee),
  profitRaw: record.profitRaw != null ? decimalToNumber(record.profitRaw) : null,
  profitUsd: record.profitUsd != null ? decimalToNumber(record.profitUsd) : null,
  gasUsed: record.gasUsed ?? null,
  gasPriceGwei: record.gasPriceGwei != null ? decimalToNumber(record.gasPriceGwei) : null,
  gasCostUsd: record.gasCostUsd != null ? decimalToNumber(record.gasCostUsd) : null,
  netProfitUsd: record.netProfitUsd != null ? decimalToNumber(record.netProfitUsd) : null,
  simulatedProfitUsd: decimalToNumber(record.simulatedProfitUsd),
  slippagePct: record.slippagePct != null ? decimalToNumber(record.slippagePct) : null,
  demandPredictionUsed: record.demandPredictionUsed,
  competingTxsInBlock: record.competingTxsInBlock ?? null,
  errorMessage: record.errorMessage ?? null,
  executionTimeMs: record.executionTimeMs,
  submittedAt: record.submittedAt ?? null,
  confirmedAt: record.confirmedAt ?? null,
  createdAt: record.createdAt,
  chain: record.chain
    ? {
        chainId: record.chain.chainId,
        name: record.chain.name,
        executorContractAddress: record.chain.executorContractAddress ?? null,
      }
    : null,
  strategy: record.strategy
    ? { id: record.strategy.id, name: record.strategy.name }
    : null,
});

const toTradeHopRecord = (record: any): TradeHopRecord => ({
  id: record.id,
  tradeId: record.tradeId,
  hopIndex: record.hopIndex,
  poolId: record.poolId,
  tokenInId: record.tokenInId,
  tokenOutId: record.tokenOutId,
  amountIn: decimalToNumber(record.amountIn),
  amountOut: decimalToNumber(record.amountOut),
  expectedAmountOut: decimalToNumber(record.expectedAmountOut),
  slippagePct: record.slippagePct != null ? decimalToNumber(record.slippagePct) : null,
  createdAt: record.createdAt,
  pool: record.pool ? { id: record.pool.id, address: record.pool.address, dex: String(record.pool.dex).toLowerCase() } : undefined,
  tokenIn: record.tokenIn ? { id: record.tokenIn.id, symbol: record.tokenIn.symbol, decimals: record.tokenIn.decimals } : undefined,
  tokenOut: record.tokenOut ? { id: record.tokenOut.id, symbol: record.tokenOut.symbol, decimals: record.tokenOut.decimals } : undefined,
});

const flashLoanProviderMap: Record<string, string> = {
  auto: 'AUTO',
  aave: 'AAVE',
  balancer: 'BALANCER',
  dydx: 'DYDX',
};

const makeDecimal = (value: number) => ({ toString: () => String(value), __prisma: 'Decimal' });

export class PrismaTradesRepository implements TradesRepository {
  public constructor(private readonly prisma: PrismaTradesClientLike) {}

  public async create(input: CreateTradeRecordInput) {
    return toTradeRecord(
      await this.prisma.trade.create({
        data: {
          strategyId: input.strategyId,
          userId: input.userId,
          chainId: input.chainId,
          routePath: input.routePath,
          routeHops: input.routeHops,
          flashLoanProvider: flashLoanProviderMap[input.flashLoanProvider] ?? 'AUTO',
          flashLoanToken: input.flashLoanToken,
          flashLoanAmount: makeDecimal(input.flashLoanAmount),
          flashLoanFee: makeDecimal(input.flashLoanFee),
          simulatedProfitUsd: makeDecimal(input.simulatedProfitUsd),
          demandPredictionUsed: input.demandPredictionUsed,
          executionTimeMs: input.executionTimeMs,
        },
        include: { chain: true, strategy: { select: { id: true, name: true } } },
      }),
    );
  }

  public async findById(userId: string, tradeId: string) {
    const record = await this.prisma.trade.findFirst({
      where: { id: tradeId, userId },
      include: {
        chain: true,
        strategy: { select: { id: true, name: true } },
        hops: {
          include: {
            pool: true,
            tokenIn: true,
            tokenOut: true,
          },
          orderBy: { hopIndex: 'asc' },
        },
      },
    });
    if (!record) return null;
    const tradeRecord = toTradeRecord(record);
    const rawHops = (record as any).hops;
    const hops = Array.isArray(rawHops) ? rawHops.map(toTradeHopRecord) : [];
    return { ...tradeRecord, hops };
  }

  public async listByUser(userId: string, filters: TradeListFilters) {
    const where: Record<string, unknown> = { userId };
    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.strategyId !== undefined) {
      where.strategyId = filters.strategyId;
    }
    if (filters.status !== undefined) {
      where.status = filters.status;
    }
    if (filters.startDate !== undefined || filters.endDate !== undefined) {
      where.createdAt = {};
      if (filters.startDate !== undefined) {
        (where.createdAt as Record<string, Date>).gte = filters.startDate;
      }
      if (filters.endDate !== undefined) {
        (where.createdAt as Record<string, Date>).lte = filters.endDate;
      }
    }
    if (filters.minProfitUsd !== undefined) {
      where.netProfitUsd = { gte: filters.minProfitUsd };
    }

    const orderBy: Record<string, string> = {};
    if (filters.sortBy === 'netProfitUsd') {
      orderBy.netProfitUsd = filters.sortOrder ?? 'desc';
    } else if (filters.sortBy === 'gasUsed') {
      orderBy.gasUsed = filters.sortOrder ?? 'desc';
    } else {
      orderBy.createdAt = filters.sortOrder ?? 'desc';
    }

    const allTrades = await this.prisma.trade.findMany({
      where,
      include: { chain: true, strategy: { select: { id: true, name: true } } },
      orderBy,
    });

    const total = allTrades.length;
    const trades = allTrades
      .slice((filters.page - 1) * filters.limit, filters.page * filters.limit)
      .map(toTradeRecord);

    return { trades, total };
  }

  public async updateStatus(tradeId: string, status: string, details?: UpdateTradeStatusDetails) {
    const updateData: Record<string, unknown> = { status };
    if (details?.txHash !== undefined) updateData.txHash = details.txHash;
    if (details?.blockNumber !== undefined) updateData.blockNumber = details.blockNumber;
    if (details?.profitRaw !== undefined) updateData.profitRaw = makeDecimal(details.profitRaw);
    if (details?.profitUsd !== undefined) updateData.profitUsd = makeDecimal(details.profitUsd);
    if (details?.gasUsed !== undefined) updateData.gasUsed = details.gasUsed;
    if (details?.gasPriceGwei !== undefined) updateData.gasPriceGwei = makeDecimal(details.gasPriceGwei);
    if (details?.gasCostUsd !== undefined) updateData.gasCostUsd = makeDecimal(details.gasCostUsd);
    if (details?.netProfitUsd !== undefined) updateData.netProfitUsd = makeDecimal(details.netProfitUsd);
    if (details?.slippagePct !== undefined) updateData.slippagePct = makeDecimal(details.slippagePct);
    if (details?.competingTxsInBlock !== undefined) updateData.competingTxsInBlock = details.competingTxsInBlock;
    if (details?.errorMessage !== undefined) updateData.errorMessage = details.errorMessage;
    if (details?.submittedAt !== undefined) updateData.submittedAt = details.submittedAt;
    if (details?.confirmedAt !== undefined) updateData.confirmedAt = details.confirmedAt;

    return toTradeRecord(
      await this.prisma.trade.update({
        where: { id: tradeId },
        data: updateData,
        include: { chain: true, strategy: { select: { id: true, name: true } } },
      }),
    );
  }

  public async addHops(tradeId: string, hops: CreateTradeHopRecordInput[]) {
    const created = await Promise.all(
      hops.map((hop) =>
        this.prisma.tradeHop.create({
          data: {
            tradeId,
            hopIndex: hop.hopIndex,
            poolId: hop.poolId,
            tokenInId: hop.tokenInId,
            tokenOutId: hop.tokenOutId,
            amountIn: makeDecimal(hop.amountIn),
            amountOut: makeDecimal(hop.amountOut),
            expectedAmountOut: makeDecimal(hop.expectedAmountOut),
            slippagePct: hop.slippagePct !== undefined ? makeDecimal(hop.slippagePct) : undefined,
          },
        }),
      ),
    );
    return created.map(toTradeHopRecord);
  }

  public async getSummary(userId: string, filters: TradeSummaryFilters) {
    const where: Record<string, unknown> = { userId };
    if (filters.chainId !== undefined) {
      where.chainId = filters.chainId;
    }
    if (filters.strategyId !== undefined) {
      where.strategyId = filters.strategyId;
    }
    if (filters.startDate !== undefined || filters.endDate !== undefined) {
      where.createdAt = {};
      if (filters.startDate !== undefined) {
        (where.createdAt as Record<string, Date>).gte = filters.startDate;
      }
      if (filters.endDate !== undefined) {
        (where.createdAt as Record<string, Date>).lte = filters.endDate;
      }
    }

    const trades = (await this.prisma.trade.findMany({
      where,
      include: { chain: false, strategy: false },
    })) as Array<{
      id: string;
      status: string;
      netProfitUsd: unknown;
      gasCostUsd: unknown;
      profitUsd: unknown;
      routePath: unknown;
      executionTimeMs: number;
      createdAt: Date;
    }>;

    let totalTrades = 0;
    let successfulTrades = 0;
    let failedTrades = 0;
    let netProfitUsd = 0;
    let totalGasCostUsd = 0;
    let totalProfitUsd = 0;
    let maxProfitTradeUsd = 0;
    let totalExecutionTimeMs = 0;

    const routeMap = new Map<string, { count: number; totalProfit: number }>();
    const profitByDayMap = new Map<string, { profit: number; trades: number }>();

    for (const trade of trades) {
      totalTrades += 1;
      const netProfit = decimalToNumber(trade.netProfitUsd);
      const gasCost = decimalToNumber(trade.gasCostUsd);
      const profit = decimalToNumber(trade.profitUsd);

      if (trade.status === 'settled' || trade.status === 'included') {
        successfulTrades += 1;
      } else if (trade.status === 'reverted' || trade.status === 'failed') {
        failedTrades += 1;
      }

      netProfitUsd += netProfit;
      totalGasCostUsd += gasCost;
      totalProfitUsd += profit;
      if (profit > maxProfitTradeUsd) maxProfitTradeUsd = profit;
      totalExecutionTimeMs += trade.executionTimeMs;

      const pathStr = this.formatRoutePath(trade.routePath);
      const existing = routeMap.get(pathStr) ?? { count: 0, totalProfit: 0 };
      routeMap.set(pathStr, { count: existing.count + 1, totalProfit: existing.totalProfit + netProfit });

      const dayKey = trade.createdAt.toISOString().split('T')[0]!;
      const dayStats = profitByDayMap.get(dayKey) ?? { profit: 0, trades: 0 };
      profitByDayMap.set(dayKey, { profit: dayStats.profit + netProfit, trades: dayStats.trades + 1 });
    }

    const topRoutes = [...routeMap.entries()]
      .sort((a, b) => b[1].totalProfit - a[1].totalProfit)
      .slice(0, 10)
      .map(([path, stats]) => ({ path, count: stats.count, totalProfit: stats.totalProfit }));

    const profitByDay = [...profitByDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({ date, profit: stats.profit, trades: stats.trades }));

    return {
      totalTrades,
      successfulTrades,
      failedTrades,
      successRate: totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0,
      totalProfitUsd,
      totalGasCostUsd,
      netProfitUsd,
      avgProfitPerTradeUsd: totalTrades > 0 ? netProfitUsd / totalTrades : 0,
      maxProfitTradeUsd,
      avgExecutionTimeMs: totalTrades > 0 ? Math.round(totalExecutionTimeMs / totalTrades) : 0,
      topRoutes,
      profitByDay,
    };
  }

  private formatRoutePath(routePath: unknown): string {
    if (!Array.isArray(routePath)) return 'Unknown';
    const hops = routePath as Array<{ tokenIn?: string; tokenOut?: string }>;
    const tokens = hops.flatMap((h) => [h.tokenIn, h.tokenOut]).filter(Boolean);
    return tokens.join('→');
  }
}
