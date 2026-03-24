import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = resolve(process.cwd(), 'prisma/migrations/20260322093000_initial/migration.sql');
const userFactoryPath = resolve(process.cwd(), 'src/factories/user.factory.ts');
const strategyFactoryPath = resolve(process.cwd(), 'src/factories/strategy.factory.ts');
const tradeFactoryPath = resolve(process.cwd(), 'src/factories/trade.factory.ts');

const schema = () => readFileSync(schemaPath, 'utf8');
const migration = () => readFileSync(migrationPath, 'utf8');
const userFactory = () => readFileSync(userFactoryPath, 'utf8');
const strategyFactory = () => readFileSync(strategyFactoryPath, 'utf8');
const tradeFactory = () => readFileSync(tradeFactoryPath, 'utf8');

describe('Phase B Prisma schema', () => {
  it('includes the complete durable model set from the Phase B spec', () => {
    const contents = schema();

    for (const model of [
      'User',
      'RefreshToken',
      'ApiKey',
      'Subscription',
      'SupportedChain',
      'Token',
      'Pool',
      'Strategy',
      'Trade',
      'TradeHop',
      'DailyAnalytics',
      'PoolSnapshot',
      'AlertRule',
      'AlertHistory',
      'CompetitorActivity',
      'SystemConfig',
      'AuditLog',
      'PasswordResetToken',
      'EmailVerificationToken',
      'TwoFactorBackupCode',
      'PasswordHistory',
      'WebhookEvent',
    ]) {
      expect(contents).toContain(`model ${model}`);
    }
  });

  it('uses Prisma enums for the spec-defined status and type fields', () => {
    const contents = schema();

    for (const enumName of [
      'UserRole',
      'SubscriptionPlan',
      'SubscriptionStatus',
      'TradeStatus',
      'FlashLoanProvider',
      'Dex',
      'DexVersion',
      'AlertType',
      'AlertChannel',
      'AlertDeliveryStatus',
      'WebhookProvider',
      'WebhookEventStatus',
    ]) {
      expect(contents).toContain(`enum ${enumName}`);
    }
  });

  it('captures the key relation mappings, uniques, and query indexes from the spec', () => {
    const contents = schema();

    for (const snippet of [
      '@@map("users")',
      '@@map("refresh_tokens")',
      '@@map("trade_hops")',
      '@@map("daily_analytics")',
      '@@map("pool_snapshots")',
      '@@map("audit_logs")',
      'replacedBy      RefreshToken? @relation("RefreshTokenReplacement"',
      'replacementFor  RefreshToken? @relation("RefreshTokenReplacement"',
      '@@unique([chainId, address])',
      '@@unique([userId, chainId, date])',
      '@@unique([tradeId, hopIndex])',
      '@@index([userId, createdAt])',
      '@@index([chainId, status, createdAt])',
      '@@index([poolId, blockNumber])',
      '@@index([type, isActive])',
      '@@unique([provider, providerEventId])',
      'model AlertRule',
      '@@map("alerts")',
      'userAgent    String?  @map("user_agent") @db.VarChar(500)',
      'requestId    String?  @map("request_id") @db.VarChar(100)',
    ]) {
      expect(contents).toContain(snippet);
    }
  });

  it('keeps the initial migration aligned with spec-only SQL invariants', () => {
    const contents = migration();

    for (const snippet of [
      'CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER("email"))',
      'CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id")',
      'CREATE INDEX "trades_chain_id_status_created_at_idx" ON "trades"("chain_id", "status", "created_at")',
      '"user_agent" VARCHAR(500)',
      '"request_id" VARCHAR(100)',
      'Partitioning note:',
    ]) {
      expect(contents).toContain(snippet);
    }
  });

  it('uses database-owned defaults for spec-defined UUID and updated_at fields', () => {
    const schemaContents = schema();
    const migrationContents = migration();

    for (const snippet of [
      '@default(dbgenerated("gen_random_uuid()")) @db.Uuid',
      'familyId       String        @default(dbgenerated("gen_random_uuid()")) @map("family_id") @db.Uuid',
      '@default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)',
    ]) {
      expect(schemaContents).toContain(snippet);
    }

    for (const snippet of [
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
      'UUID NOT NULL DEFAULT gen_random_uuid()',
      '"family_id" UUID NOT NULL DEFAULT gen_random_uuid()',
      '"updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    ]) {
      expect(migrationContents).toContain(snippet);
    }
  });

  it('provides minimal factories aligned to the new user strategy and trade models', () => {
    expect(userFactory()).toContain('buildUserFactoryInput');
    expect(strategyFactory()).toContain('buildStrategyFactoryInput');
    expect(tradeFactory()).toContain('buildTradeFactoryInput');
  });
});
