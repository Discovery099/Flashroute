export interface WebhookEventRecord {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED';
  attempts: number;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

interface WebhookEventModel {
  findUnique(args: { where: { provider_providerEventId: { provider: string; providerEventId: string } } }): Promise<WebhookEventRecord | null>;
  upsert(args: {
    where: { provider_providerEventId: { provider: string; providerEventId: string } };
    create: { provider: string; providerEventId: string; eventType: string; status: string; attempts: number };
    update: { status: string; attempts: { increment: number } };
  }): Promise<WebhookEventRecord>;
  updateMany(args: {
    where: Record<string, any>;
    data: { status: string; processedAt?: Date; errorMessage?: string };
  }): Promise<{ count: number }>;
  create(args: {
    data: { provider: string; providerEventId: string; eventType: string; status: string; attempts: number };
  }): Promise<WebhookEventRecord>;
  update(args: {
    where: { id: string };
    data: { status: string; attempts?: { increment: number } };
  }): Promise<WebhookEventRecord>;
}

export interface PrismaWebhookClient {
  webhookEvent: WebhookEventModel;
}

export class WebhookIdempotencyGuard {
  public constructor(private readonly prisma: PrismaWebhookClient) {}

  public async checkAndSet(eventId: string, eventType: string): Promise<{
    canProcess: boolean;
    existingEvent?: WebhookEventRecord;
  }> {
    try {
      const created = await this.prisma.webhookEvent.create({
        data: {
          provider: 'STRIPE',
          providerEventId: eventId,
          eventType,
          status: 'PROCESSING',
          attempts: 1,
        },
      });
      return { canProcess: true };
    } catch (err: any) {
      if (err.code === 'P2002') {
        const existing = await this.prisma.webhookEvent.findUnique({
          where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
        });
        if (existing?.status === 'PROCESSED') {
          return { canProcess: false, existingEvent: existing as WebhookEventRecord };
        }
        if (existing?.status === 'PROCESSING') {
          return { canProcess: false, existingEvent: existing as WebhookEventRecord };
        }
        const updated = await this.prisma.webhookEvent.update({
          where: { id: existing!.id },
          data: { status: 'PROCESSING', attempts: { increment: 1 } },
        });
        return { canProcess: true, existingEvent: updated as WebhookEventRecord };
      }
      throw err;
    }
  }

  public async markProcessed(eventId: string): Promise<void> {
    const result = await this.prisma.webhookEvent.updateMany({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    if (result.count === 0) {
      throw new Error(`No event found for eventId: ${eventId}`);
    }
  }

  public async markFailed(eventId: string, errorMessage: string): Promise<void> {
    const result = await this.prisma.webhookEvent.updateMany({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
      data: { status: 'FAILED', errorMessage },
    });
    if (result.count === 0) {
      throw new Error(`No event found for eventId: ${eventId}`);
    }
  }

  public async recoverStaleEvents(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await this.prisma.webhookEvent.updateMany({
      where: {
        status: 'PROCESSING',
        createdAt: { lt: cutoff },
      },
      data: { status: 'FAILED', errorMessage: 'Stale event - timeout' },
    });
    return result.count;
  }
}
