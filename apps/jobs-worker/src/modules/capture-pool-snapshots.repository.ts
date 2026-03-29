import type { Redis } from 'ioredis';
import { PrismaClient, Prisma } from '@prisma/client';
import { createLogger } from '@flashroute/shared';

const logger = createLogger('jobs-worker:snapshots');

export class CapturePoolSnapshotsRepository {
  constructor(private readonly redis: Redis, private readonly prisma: PrismaClient) {}

  async captureSnapshots(): Promise<number> {
    const chains = await this.prisma.supportedChain.findMany({
      where: { isActive: true },
      select: { chainId: true },
    });

    let totalCaptured = 0;

    for (const { chainId } of chains) {
      try {
        const poolKeys = await this.redis.zrevrange(
          `fr:pools:tvl:${chainId}`,
          0,
          99,
          'WITHSCORES'
        );

        const poolEntries: { poolId: string; tvlUsd: number }[] = [];
        for (let i = 0; i < poolKeys.length; i += 2) {
          const poolId = poolKeys[i];
          const tvlStr = poolKeys[i + 1];
          const tvl = parseFloat(tvlStr);
          if (poolId && !isNaN(tvl)) {
            poolEntries.push({ poolId, tvlUsd: tvl });
          }
        }

        if (poolEntries.length === 0) {
          logger.debug({ chainId }, 'No pools found in Redis for snapshot');
          continue;
        }

        const poolIds = poolEntries.map((e) => e.poolId);
        const pools = await this.prisma.pool.findMany({
          where: { id: { in: poolIds } },
          select: { id: true, tvlUsd: true },
        });

        const poolMap = new Map(pools.map((p) => [p.id, p]));

        const blockNumbers = new Set<bigint>();
        for (const pool of pools) {
          const blockNum = await this.redis.get(`fr:pool:${pool.id}:block`);
          if (blockNum) blockNumbers.add(BigInt(blockNum));
        }
        const latestBlock = blockNumbers.size > 0
          ? Array.from(blockNumbers).sort((a, b) => (a > b ? -1 : 1))[0]
          : null;

        const now = new Date();
        const bucketStart = new Date(
          Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000)
        );

        const snapshots = poolEntries
          .filter((e) => poolMap.has(e.poolId))
          .map((entry) => {
            return {
              poolId: entry.poolId,
              chainId,
              blockNumber: latestBlock || BigInt(0),
              reserve0: new Prisma.Decimal(0),
              reserve1: new Prisma.Decimal(0),
              price0In1: new Prisma.Decimal(0),
              tvlUsd: new Prisma.Decimal(entry.tvlUsd),
              createdAt: bucketStart,
            };
          });

        if (snapshots.length > 0) {
          await this.prisma.poolSnapshot.createMany({
            data: snapshots,
            skipDuplicates: true,
          });
          totalCaptured += snapshots.length;
        }

        logger.debug(
          { chainId, captured: snapshots.length },
          'Captured pool snapshots'
        );
      } catch (err) {
        logger.error(
          { chainId, error: err instanceof Error ? err.message : 'Unknown' },
          'Failed to capture pool snapshots for chain'
        );
      }
    }

    logger.info({ totalCaptured }, 'Completed pool snapshot capture');
    return totalCaptured;
  }

  async pruneOldSnapshots(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    cutoffDate.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.poolSnapshot.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    logger.info(
      { deleted: result.count, retentionDays },
      'Pruned old pool snapshots'
    );
    return result.count;
  }
}
