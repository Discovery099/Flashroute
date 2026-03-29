import { PrismaClient } from '@prisma/client';
import { createLogger } from '@flashroute/shared';
import { CapturePoolSnapshotsRepository } from './capture-pool-snapshots.repository.js';

const logger = createLogger('jobs-worker:cleanup');

const BATCH_SIZE = 10_000;
const YIELD_MS = 100;

export class CleanupExpiredDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async cleanupAll(): Promise<void> {
    await Promise.all([
      this.deleteExpiredRefreshTokens(),
      this.deleteOldAuditLogs(),
      this.archiveOldTrades(),
      this.deleteOldCompetitorActivity(),
      this.deleteOldAlertHistory(),
      this.pruneOldPoolSnapshots(),
    ]);
  }

  private async deleteWithBatchYield(
    deleteFn: () => Promise<number>,
    type: string
  ): Promise<number> {
    let totalDeleted = 0;
    let deleted: number;

    do {
      deleted = await deleteFn();
      totalDeleted += deleted;
      if (deleted > 0) {
        logger.debug({ deleted, type }, `Batch deleted ${type}`);
      }
      if (deleted === BATCH_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, YIELD_MS));
      }
    } while (deleted === BATCH_SIZE);

    return totalDeleted;
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const deleteFn = () =>
      this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'expired_refresh_tokens');
    logger.info({ totalDeleted }, 'Deleted expired refresh tokens');
    return totalDeleted;
  }

  async deleteOldAuditLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleteFn = () =>
      this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'audit_logs');
    logger.info({ totalDeleted, retentionDays }, 'Deleted old audit logs');
    return totalDeleted;
  }

  async archiveOldTrades(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleteFn = () =>
      this.prisma.trade.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: { in: ['SETTLED', 'REVERTED', 'FAILED'] },
        },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'old_trades');
    logger.info({ totalDeleted, retentionDays }, 'Archived old trades');
    return totalDeleted;
  }

  async deleteOldCompetitorActivity(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleteFn = () =>
      this.prisma.competitorActivity.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'competitor_activity');
    logger.info({ totalDeleted, retentionDays }, 'Deleted old competitor activity');
    return totalDeleted;
  }

  async deleteOldAlertHistory(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleteFn = () =>
      this.prisma.alertHistory.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'alert_history');
    logger.info({ totalDeleted, retentionDays }, 'Deleted old alert history');
    return totalDeleted;
  }

  async pruneOldPoolSnapshots(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    cutoffDate.setUTCHours(0, 0, 0, 0);

    const deleteFn = () =>
      this.prisma.poolSnapshot.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      }).then((r) => r.count);

    const totalDeleted = await this.deleteWithBatchYield(deleteFn, 'pool_snapshots');
    logger.info({ totalDeleted, retentionDays }, 'Pruned old pool snapshots');
    return totalDeleted;
  }
}
