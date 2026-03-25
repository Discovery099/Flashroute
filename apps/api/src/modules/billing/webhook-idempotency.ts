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
    where: { provider_providerEventId: { provider: string; providerEventId: string } };
    data: { status: string; processedAt?: Date; errorMessage?: string };
  }): Promise<{ count: number }>;
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
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
    });

    if (existing?.status === 'PROCESSED') {
      return { canProcess: false, existingEvent: existing as WebhookEventRecord };
    }

    if (existing?.status === 'PROCESSING') {
      return { canProcess: false, existingEvent: existing as WebhookEventRecord };
    }

    await this.prisma.webhookEvent.upsert({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
      create: {
        provider: 'STRIPE',
        providerEventId: eventId,
        eventType,
        status: 'PROCESSING',
        attempts: 1,
      },
      update: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });

    return { canProcess: true };
  }

  public async markProcessed(eventId: string): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  }

  public async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: eventId } },
      data: { status: 'FAILED', errorMessage },
    });
  }
}
