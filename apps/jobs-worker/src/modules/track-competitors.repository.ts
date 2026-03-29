import type { Redis } from 'ioredis';
import { PrismaClient, Prisma } from '@prisma/client';
import { createLogger } from '@flashroute/shared';

const logger = createLogger('jobs-worker:competitors');

interface CompetitorTx {
  txHash: string;
  botAddress: string;
  chainId: number;
  blockNumber: bigint;
  routePath: string[];
  estimatedProfitUsd: number | null;
  gasUsed: bigint;
  gasPriceGwei: number;
}

export class TrackCompetitorsRepository {
  constructor(private readonly redis: Redis, private readonly prisma: PrismaClient) {}

  async trackCompetitors(): Promise<number> {
    const chains = await this.prisma.supportedChain.findMany({
      where: { isActive: true },
      select: { chainId: true },
    });

    let totalTracked = 0;

    for (const { chainId } of chains) {
      try {
        const txKeys = await this.redis.keys(`fr:competitor:${chainId}:*`);
        
        if (txKeys.length === 0) {
          logger.debug({ chainId }, 'No competitor transactions found');
          continue;
        }

        const competitors: Map<string, CompetitorTx[]> = new Map();

        for (const key of txKeys) {
          const data = await this.redis.get(key);
          if (!data) continue;

          try {
            const tx: CompetitorTx = JSON.parse(data);
            
            if (!competitors.has(tx.botAddress)) {
              competitors.set(tx.botAddress, []);
            }
            competitors.get(tx.botAddress)!.push(tx);
          } catch {
            logger.warn({ key }, 'Failed to parse competitor transaction');
          }
        }

        const activities: Prisma.CompetitorActivityCreateManyInput[] = [];

        for (const [botAddress, txs] of competitors) {
          for (const tx of txs) {
            const confidence = this.calculateBotConfidence(tx, txs);

            if (confidence < 0.3) {
              continue;
            }

            activities.push({
              chainId: tx.chainId,
              blockNumber: BigInt(tx.blockNumber),
              txHash: tx.txHash,
              botAddress,
              routePath: tx.routePath,
              estimatedProfitUsd: tx.estimatedProfitUsd
                ? new Prisma.Decimal(tx.estimatedProfitUsd)
                : new Prisma.Decimal(0),
              gasUsed: BigInt(tx.gasUsed),
              gasPriceGwei: new Prisma.Decimal(tx.gasPriceGwei),
            });

            await this.redis.del(`fr:competitor:${chainId}:${tx.txHash}`);
          }
        }

        if (activities.length > 0) {
          await this.prisma.competitorActivity.createMany({ data: activities });
          totalTracked += activities.length;
        }
      } catch (err) {
        logger.error(
          { chainId, error: err instanceof Error ? err.message : 'Unknown' },
          'Failed to track competitors for chain'
        );
      }
    }

    logger.info({ totalTracked }, 'Completed competitor tracking');
    return totalTracked;
  }

  private calculateBotConfidence(tx: CompetitorTx, allTxsForBot: CompetitorTx[]): number {
    let confidence = 0;

    if (allTxsForBot.length >= 3) {
      confidence += 0.3;
    }
    if (allTxsForBot.length >= 10) {
      confidence += 0.2;
    }

    const sameRoute = allTxsForBot.filter(
      (t) => JSON.stringify(t.routePath) === JSON.stringify(tx.routePath)
    ).length;
    if (sameRoute >= 3) {
      confidence += 0.2;
    }

    const recentBlocks = allTxsForBot.filter(
      (t) => Math.abs(Number(t.blockNumber) - Number(tx.blockNumber)) <= 10
    ).length;
    if (recentBlocks >= 3) {
      confidence += 0.15;
    }

    if (tx.routePath.length >= 3) {
      confidence += 0.1;
    }

    if (tx.gasUsed < 500000n) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1);
  }
}
