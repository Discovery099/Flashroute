import { PrismaClient, Prisma, TradeStatus } from '@prisma/client';
import { createLogger } from '@flashroute/shared';

const logger = createLogger('jobs-worker:analytics');

export class AggregateDailyAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregateForUserAndDate(
    userId: string,
    chainId: number,
    date: Date
  ): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const result = await this.prisma.$transaction(async (tx) => {
      const trades = await tx.trade.findMany({
        where: {
          userId,
          chainId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        select: {
          id: true,
          status: true,
          profitUsd: true,
          gasCostUsd: true,
          executionTimeMs: true,
          routeHops: true,
          demandPredictionUsed: true,
        },
      });

      if (trades.length === 0) {
        await tx.dailyAnalytics.upsert({
          where: {
            userId_chainId_date: {
              userId,
              chainId,
              date: startOfDay,
            },
          },
          create: {
            userId,
            chainId,
            date: startOfDay,
            totalTrades: 0,
            successfulTrades: 0,
            failedTrades: 0,
            totalProfitUsd: new Prisma.Decimal(0),
            totalGasCostUsd: new Prisma.Decimal(0),
            totalVolumeUsd: new Prisma.Decimal(0),
            avgProfitPerTradeUsd: new Prisma.Decimal(0),
            maxProfitTradeUsd: new Prisma.Decimal(0),
            avgExecutionTimeMs: 0,
            mostProfitableRoute: Prisma.JsonNull,
            demandPredictionHitRate: null,
          },
          update: {
            totalTrades: 0,
            failedTrades: 0,
            totalProfitUsd: new Prisma.Decimal(0),
            totalGasCostUsd: new Prisma.Decimal(0),
            totalVolumeUsd: new Prisma.Decimal(0),
            avgProfitPerTradeUsd: new Prisma.Decimal(0),
            maxProfitTradeUsd: new Prisma.Decimal(0),
            avgExecutionTimeMs: 0,
            mostProfitableRoute: Prisma.JsonNull,
            demandPredictionHitRate: null,
          },
        });
        return;
      }

      const successfulTrades = trades.filter(
        (t) => t.status === TradeStatus.SETTLED || t.status === TradeStatus.INCLUDED
      );
      const failedTrades = trades.filter(
        (t) => t.status === TradeStatus.REVERTED || t.status === TradeStatus.FAILED
      );

      const totalProfit = trades.reduce(
        (sum, t) => sum + (t.profitUsd ? Number(t.profitUsd) : 0),
        0
      );
      const totalGasCost = trades.reduce(
        (sum, t) => sum + (t.gasCostUsd ? Number(t.gasCostUsd) : 0),
        0
      );
      const totalVolume = successfulTrades.reduce((sum, t) => {
        return sum + (t.profitUsd ? Number(t.profitUsd) + Number(t.gasCostUsd || 0) : 0);
      }, 0);

      const avgProfit = trades.length > 0 ? totalProfit / trades.length : 0;
      const maxProfit = Math.max(
        ...trades.map((t) => (t.profitUsd ? Number(t.profitUsd) : 0)),
        0
      );

      const avgExecutionTime =
        trades.length > 0
          ? trades.reduce((sum, t) => sum + t.executionTimeMs, 0) / trades.length
          : 0;

      const predictionUsedCount = trades.filter((t) => t.demandPredictionUsed).length;
      const predictionHitCount = successfulTrades.filter(
        (t) => t.demandPredictionUsed
      ).length;
      const predictionHitRate =
        predictionUsedCount > 0 ? predictionHitCount / predictionUsedCount : null;

      const profitableTrades = successfulTrades.filter(
        (t) => t.profitUsd && Number(t.profitUsd) > 0
      );
      const winRate =
        successfulTrades.length > 0
          ? profitableTrades.length / successfulTrades.length
          : 0;

      const mostProfitableTrade = trades.reduce(
        (max, t) =>
          !max || (t.profitUsd && Number(t.profitUsd) > Number(max.profitUsd || 0))
            ? t
            : max,
        null as (typeof trades)[0] | null
      );

      await tx.dailyAnalytics.upsert({
        where: {
          userId_chainId_date: {
            userId,
            chainId,
            date: startOfDay,
          },
        },
        create: {
          userId,
          chainId,
          date: startOfDay,
          totalTrades: trades.length,
          successfulTrades: successfulTrades.length,
          failedTrades: failedTrades.length,
          totalProfitUsd: new Prisma.Decimal(totalProfit),
          totalGasCostUsd: new Prisma.Decimal(totalGasCost),
          totalVolumeUsd: new Prisma.Decimal(totalVolume),
          avgProfitPerTradeUsd: new Prisma.Decimal(avgProfit),
          maxProfitTradeUsd: new Prisma.Decimal(maxProfit),
          avgExecutionTimeMs: Math.round(avgExecutionTime),
          mostProfitableRoute: mostProfitableTrade
            ? { tradeId: mostProfitableTrade.id, routeHops: mostProfitableTrade.routeHops }
            : Prisma.JsonNull,
          demandPredictionHitRate: predictionHitRate !== null ? new Prisma.Decimal(predictionHitRate) : null,
        },
        update: {
          totalTrades: trades.length,
          successfulTrades: successfulTrades.length,
          failedTrades: failedTrades.length,
          totalProfitUsd: new Prisma.Decimal(totalProfit),
          totalGasCostUsd: new Prisma.Decimal(totalGasCost),
          totalVolumeUsd: new Prisma.Decimal(totalVolume),
          avgProfitPerTradeUsd: new Prisma.Decimal(avgProfit),
          maxProfitTradeUsd: new Prisma.Decimal(maxProfit),
          avgExecutionTimeMs: Math.round(avgExecutionTime),
          mostProfitableRoute: mostProfitableTrade
            ? { tradeId: mostProfitableTrade.id, routeHops: mostProfitableTrade.routeHops }
            : Prisma.JsonNull,
          demandPredictionHitRate: predictionHitRate !== null ? new Prisma.Decimal(predictionHitRate) : null,
        },
      });

      return {
        userId,
        chainId,
        date: startOfDay.toISOString().split('T')[0],
        totalTrades: trades.length,
        successfulTrades: successfulTrades.length,
        failedTrades: failedTrades.length,
        winRate,
      };
    });

    logger.debug(result, 'Aggregated daily analytics');
  }

  async aggregateForDate(date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const userChainPairs = await this.prisma.trade.groupBy({
      by: ['userId', 'chainId'],
      where: {
        createdAt: {
          gte: startOfDay,
          lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });

    logger.info(
      { date: startOfDay.toISOString().split('T')[0], pairs: userChainPairs.length },
      'Starting daily analytics aggregation'
    );

    for (const { userId, chainId } of userChainPairs) {
      try {
        await this.aggregateForUserAndDate(userId, chainId, date);
      } catch (err) {
        logger.error(
          { userId, chainId, date: date.toISOString(), error: err instanceof Error ? err.message : 'Unknown' },
          'Failed to aggregate analytics for user+chain'
        );
      }
    }

    logger.info(
      { date: startOfDay.toISOString().split('T')[0] },
      'Completed daily analytics aggregation'
    );
  }
}
