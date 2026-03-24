// NOTE: These SQL aggregations are candidates for pre-aggregation (e.g., nightly
// jobs-worker job writing to daily_analytics) when trade volume exceeds ~10k rows/user.

import type { PrismaTradesClientLike } from '../trades/trades.repository';
import type { AnalyticsOverviewData, RouteAnalytics, CompetitorData, GasAnalytics } from './analytics.types';

const decimalToNumber = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return Number(v);
};

const makeDateRange = (period?: string, startDate?: string, endDate?: string): [Date, Date] => {
  const end = endDate ? new Date(endDate) : new Date();
  let start: Date;
  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date(end);
    switch (period) {
      case '7d': start.setDate(start.getDate() - 7); break;
      case '30d': start.setDate(start.getDate() - 30); break;
      case '90d': start.setDate(start.getDate() - 90); break;
      case 'all': start = new Date(0); break;
      default: start.setDate(start.getDate() - 7);
    }
  }
  return [start, end];
};

interface TradeRow {
  id: string;
  chainId: number;
  status: string;
  routePath: unknown;
  profitUsd: unknown;
  gasCostUsd: unknown;
  netProfitUsd: unknown;
  gasUsed: unknown;
  gasPriceGwei: unknown;
  slippagePct: unknown;
  executionTimeMs: number;
  createdAt: Date;
  strategyId: string;
}

interface CompetitorRow {
  id: string;
  chainId: number;
  botAddress: string;
  routePath: unknown;
  estimatedProfitUsd: unknown;
  gasUsed: unknown;
  gasPriceGwei: unknown;
  createdAt: Date;
}

export class AnalyticsRepository {
  public constructor(private readonly prisma: PrismaTradesClientLike) {}

  public async getOverview(
    userId: string,
    query: { chainId?: number; period?: string; startDate?: string; endDate?: string }
  ): Promise<AnalyticsOverviewData> {
    const where: Record<string, unknown> = { userId };
    if (query.chainId !== undefined) {
      where.chainId = query.chainId;
    }

    const [startDate, endDate] = makeDateRange(query.period, query.startDate, query.endDate);
    where.createdAt = { gte: startDate, lte: endDate };

    const trades = (await this.prisma.trade.findMany({
      where,
      include: { chain: false, strategy: false },
      orderBy: { createdAt: 'asc' },
    })) as TradeRow[];

    const dailyMap = new Map<string, { gross: number; gas: number; net: number; success: number; fail: number; count: number }>();

    for (const trade of trades) {
      const dayKey = trade.createdAt.toISOString().split('T')[0]!;
      const day = dailyMap.get(dayKey) ?? { gross: 0, gas: 0, net: 0, success: 0, fail: 0, count: 0 };
      dailyMap.set(dayKey, {
        gross: day.gross + decimalToNumber(trade.profitUsd),
        gas: day.gas + decimalToNumber(trade.gasCostUsd),
        net: day.net + decimalToNumber(trade.netProfitUsd),
        success: trade.status === 'settled' || trade.status === 'included' ? day.success + 1 : day.success,
        fail: trade.status === 'reverted' || trade.status === 'failed' ? day.fail + 1 : day.fail,
        count: day.count + 1,
      });
    }

    const dailyBreakdown: AnalyticsOverviewData['dailyBreakdown'] = [];
    let cumulativeProfit = 0;

    const sortedDays = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [date, stats] of sortedDays) {
      cumulativeProfit += stats.net;
      dailyBreakdown.push({
        date,
        grossProfitUsd: stats.gross,
        gasCostUsd: stats.gas,
        netProfitUsd: stats.net,
        tradeCount: stats.count,
      });
    }

    const profitTrend = dailyBreakdown.map((d) => ({
      date: d.date,
      cumulativeProfitUsd: (() => {
        let cum = 0;
        for (const day of dailyBreakdown) {
          if (day.date <= d.date) cum += day.netProfitUsd;
        }
        return cum;
      })(),
    }));

    const volumeTrend = dailyBreakdown.map((d) => ({ date: d.date, tradeCount: d.tradeCount, volumeUsd: d.grossProfitUsd }));

    const successRateTrend = dailyBreakdown.map((d) => {
      const total = dailyMap.get(d.date)?.count ?? 0;
      const success = dailyMap.get(d.date)?.success ?? 0;
      return { date: d.date, successRate: total > 0 ? (success / total) * 100 : 0 };
    });

    return { profitTrend, volumeTrend, successRateTrend, dailyBreakdown };
  }

  public async getRoutes(
    userId: string,
    query: { chainId?: number; period?: string; strategyId?: string; startDate?: string; endDate?: string; limit: number }
  ): Promise<{ routes: RouteAnalytics[] }> {
    const where: Record<string, unknown> = { userId };
    if (query.chainId !== undefined) where.chainId = query.chainId;
    if (query.strategyId !== undefined) where.strategyId = query.strategyId;

    const [startDate, endDate] = makeDateRange(query.period, query.startDate, query.endDate);
    where.createdAt = { gte: startDate, lte: endDate };

    const trades = (await this.prisma.trade.findMany({
      where,
      include: { chain: false, strategy: false },
    })) as TradeRow[];

    const routeMap = new Map<string, {
      count: number;
      success: number;
      totalProfit: number;
      totalSlippage: number;
      totalExecutionTime: number;
      lastExecutedAt: Date;
    }>();

    for (const trade of trades) {
      const routeKey = this.serializeRoutePath(trade.routePath);
      const existing = routeMap.get(routeKey) ?? {
        count: 0,
        success: 0,
        totalProfit: 0,
        totalSlippage: 0,
        totalExecutionTime: 0,
        lastExecutedAt: trade.createdAt,
      };
      routeMap.set(routeKey, {
        count: existing.count + 1,
        success: trade.status === 'settled' || trade.status === 'included' ? existing.success + 1 : existing.success,
        totalProfit: existing.totalProfit + decimalToNumber(trade.netProfitUsd),
        totalSlippage: existing.totalSlippage + decimalToNumber(trade.slippagePct),
        totalExecutionTime: existing.totalExecutionTime + trade.executionTimeMs,
        lastExecutedAt: trade.createdAt > existing.lastExecutedAt ? trade.createdAt : existing.lastExecutedAt,
      });
    }

    const routes: RouteAnalytics[] = [...routeMap.entries()]
      .map(([routeKey, stats]) => ({
        routeKey,
        dexes: this.extractDexes(routeKey),
        executionCount: stats.count,
        successCount: stats.success,
        totalProfitUsd: stats.totalProfit,
        avgProfitUsd: stats.count > 0 ? stats.totalProfit / stats.count : 0,
        avgSlippagePct: stats.count > 0 ? stats.totalSlippage / stats.count : 0,
        avgExecutionTimeMs: stats.count > 0 ? stats.totalExecutionTime / stats.count : 0,
        lastExecutedAt: stats.lastExecutedAt.toISOString(),
      }))
      .sort((a, b) => b.totalProfitUsd - a.totalProfitUsd)
      .slice(0, query.limit);

    return { routes };
  }

  public async getCompetitors(
    query: { chainId?: number; startDate?: string; endDate?: string; limit: number }
  ): Promise<{ competitors: CompetitorData[]; totalCompetitorTrades: number; ourWinRate: null }> {
    const where: Record<string, unknown> = {};
    if (query.chainId !== undefined) where.chainId = query.chainId;

    const [startDate, endDate] = makeDateRange(undefined, query.startDate, query.endDate);
    where.createdAt = { gte: startDate, lte: endDate };

    const competitorActivity = (this.prisma as any).competitorActivity;
    const records = (await competitorActivity.findMany({
      where,
    })) as CompetitorRow[];

    const competitorMap = new Map<string, {
      tradeCount: number;
      estimatedProfit: number;
      totalGasPrice: number;
      routes: string[];
      firstSeenAt: Date;
      lastSeenAt: Date;
    }>();

    for (const record of records) {
      const existing = competitorMap.get(record.botAddress) ?? {
        tradeCount: 0,
        estimatedProfit: 0,
        totalGasPrice: 0,
        routes: [],
        firstSeenAt: record.createdAt,
        lastSeenAt: record.createdAt,
      };
      const routeStr = this.serializeRoutePath(record.routePath);
      competitorMap.set(record.botAddress, {
        tradeCount: existing.tradeCount + 1,
        estimatedProfit: existing.estimatedProfit + decimalToNumber(record.estimatedProfitUsd),
        totalGasPrice: existing.totalGasPrice + decimalToNumber(record.gasPriceGwei),
        routes: existing.routes.includes(routeStr) ? existing.routes : [...existing.routes, routeStr],
        firstSeenAt: record.createdAt < existing.firstSeenAt ? record.createdAt : existing.firstSeenAt,
        lastSeenAt: record.createdAt > existing.lastSeenAt ? record.createdAt : existing.lastSeenAt,
      });
    }

    const competitors: CompetitorData[] = [...competitorMap.entries()]
      .map(([botAddress, stats]) => ({
        botAddress,
        tradeCount: stats.tradeCount,
        estimatedProfitUsd: stats.estimatedProfit,
        avgGasPriceGwei: stats.tradeCount > 0 ? stats.totalGasPrice / stats.tradeCount : 0,
        mostUsedRoutes: stats.routes.slice(0, 3),
        firstSeenAt: stats.firstSeenAt.toISOString(),
        lastSeenAt: stats.lastSeenAt.toISOString(),
      }))
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, query.limit);

    const totalCompetitorTrades = records.length;

    return { competitors, totalCompetitorTrades, ourWinRate: null };
  }

  public async getGas(
    userId: string,
    query: { chainId?: number; period?: string }
  ): Promise<GasAnalytics> {
    const where: Record<string, unknown> = { userId };
    if (query.chainId !== undefined) where.chainId = query.chainId;

    const [startDate, endDate] = makeDateRange(query.period, undefined, undefined);
    where.createdAt = { gte: startDate, lte: endDate };

    const trades = (await this.prisma.trade.findMany({
      where,
      include: { chain: false, strategy: false },
    })) as TradeRow[];

    let gasSpentTotalUsd = 0;
    let totalGasCostCount = 0;

    const hourlyMap = new Map<string, { totalGasPrice: number; count: number }>();

    for (const trade of trades) {
      gasSpentTotalUsd += decimalToNumber(trade.gasCostUsd);
      if (trade.gasCostUsd !== null && trade.gasCostUsd !== undefined) {
        totalGasCostCount += 1;
      }

      const hourKey = new Date(trade.createdAt);
      hourKey.setMinutes(0, 0, 0);
      const hourStr = hourKey.toISOString();

      const existing = hourlyMap.get(hourStr) ?? { totalGasPrice: 0, count: 0 };
      hourlyMap.set(hourStr, {
        totalGasPrice: existing.totalGasPrice + decimalToNumber(trade.gasPriceGwei),
        count: existing.count + 1,
      });
    }

    const gasTrend = [...hourlyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, stats]) => ({
        hour,
        avgBaseFeeGwei: stats.count > 0 ? stats.totalGasPrice / stats.count : null,
        avgPriorityFeeGwei: null,
      }));

    return {
      currentBaseFeeGwei: null,
      avgBaseFee24h: null,
      avgPriorityFee24h: null,
      ourAvgGasCost: totalGasCostCount > 0 ? gasSpentTotalUsd / totalGasCostCount : null,
      gasSpentTotalUsd: gasSpentTotalUsd,
      gasSavedByFlashbotsUsd: null,
      optimalExecutionHours: null,
      gasTrend,
    };
  }

  private serializeRoutePath(routePath: unknown): string {
    if (!Array.isArray(routePath)) return 'Unknown';
    const hops = routePath as Array<{ tokenIn?: string; tokenOut?: string }>;
    return hops.map((h) => `${h.tokenIn ?? '?'}→${h.tokenOut ?? '?'}`).join('→');
  }

  private extractDexes(routeKey: string): string {
    return 'Unknown';
  }
}
