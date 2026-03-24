-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('monitor', 'trader', 'executor', 'institutional', 'admin');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('monitor', 'trader', 'executor', 'institutional');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled', 'trialing');

-- CreateEnum
CREATE TYPE "Dex" AS ENUM ('uniswap_v2', 'uniswap_v3', 'sushiswap', 'curve', 'balancer');

-- CreateEnum
CREATE TYPE "DexVersion" AS ENUM ('v2', 'v3', 'stable', 'weighted');

-- CreateEnum
CREATE TYPE "FlashLoanProvider" AS ENUM ('auto', 'aave', 'balancer', 'dydx');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('pending', 'submitted', 'included', 'confirmed', 'reverted', 'failed');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('opportunity_found', 'trade_executed', 'trade_failed', 'profit_threshold', 'gas_spike', 'system_error');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('dashboard', 'email', 'telegram', 'webhook');

-- CreateEnum
CREATE TYPE "AlertDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('stripe');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'monitor',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(6),
    "stripe_customer_id" VARCHAR(255),
    "avatar_url" VARCHAR(500),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "last_login_at" TIMESTAMP(6),
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" VARCHAR(255),
    "notification_preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "family_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "replaced_by" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "last_used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(8) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '["read"]'::jsonb,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "last_used_at" TIMESTAMP(6),
    "expires_at" TIMESTAMP(6),
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255) NOT NULL,
    "stripe_price_id" VARCHAR(255) NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'monitor',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(6) NOT NULL,
    "current_period_end" TIMESTAMP(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "trial_end" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_chains" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "rpc_url" VARCHAR(500) NOT NULL,
    "ws_url" VARCHAR(500) NOT NULL,
    "flashbots_relay_url" VARCHAR(500),
    "block_time_ms" INTEGER NOT NULL DEFAULT 12000,
    "native_token_symbol" VARCHAR(10) NOT NULL DEFAULT 'ETH',
    "explorer_url" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "executor_contract_address" VARCHAR(42),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supported_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain_id" INTEGER NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "decimals" SMALLINT NOT NULL,
    "is_stablecoin" BOOLEAN NOT NULL DEFAULT false,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklist_reason" VARCHAR(255),
    "coingecko_id" VARCHAR(100),
    "logo_url" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain_id" INTEGER NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "dex" "Dex" NOT NULL,
    "dex_version" "DexVersion" NOT NULL,
    "token0_id" UUID NOT NULL,
    "token1_id" UUID NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "tvl_usd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "volume_24h_usd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_tvl_threshold" DECIMAL(20,2) NOT NULL DEFAULT 10000,
    "extra_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_synced_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "min_profit_usd" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "max_trade_size_usd" DECIMAL(14,2) NOT NULL DEFAULT 100000,
    "max_hops" SMALLINT NOT NULL DEFAULT 4,
    "allowed_dexes" JSONB NOT NULL DEFAULT '["uniswap_v2","uniswap_v3","sushiswap","curve","balancer"]'::jsonb,
    "allowed_tokens" JSONB,
    "blocked_tokens" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "flash_loan_provider" "FlashLoanProvider" NOT NULL DEFAULT 'auto',
    "use_flashbots" BOOLEAN NOT NULL DEFAULT true,
    "max_gas_price_gwei" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "risk_buffer_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    "use_demand_prediction" BOOLEAN NOT NULL DEFAULT true,
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "total_profit_usd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "strategy_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'pending',
    "tx_hash" VARCHAR(66),
    "block_number" BIGINT,
    "route_path" JSONB NOT NULL,
    "route_hops" SMALLINT NOT NULL,
    "flash_loan_provider" "FlashLoanProvider" NOT NULL,
    "flash_loan_token" VARCHAR(42) NOT NULL,
    "flash_loan_amount" DECIMAL(30,0) NOT NULL,
    "flash_loan_fee" DECIMAL(30,0) NOT NULL,
    "profit_raw" DECIMAL(30,0),
    "profit_usd" DECIMAL(14,4),
    "gas_used" BIGINT,
    "gas_price_gwei" DECIMAL(10,4),
    "gas_cost_usd" DECIMAL(10,4),
    "net_profit_usd" DECIMAL(14,4),
    "simulated_profit_usd" DECIMAL(14,4) NOT NULL,
    "slippage_pct" DECIMAL(6,4),
    "demand_prediction_used" BOOLEAN NOT NULL DEFAULT false,
    "competing_txs_in_block" INTEGER,
    "error_message" TEXT,
    "execution_time_ms" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(6),
    "confirmed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_hops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trade_id" UUID NOT NULL,
    "hop_index" SMALLINT NOT NULL,
    "pool_id" UUID NOT NULL,
    "token_in_id" UUID NOT NULL,
    "token_out_id" UUID NOT NULL,
    "amount_in" DECIMAL(30,0) NOT NULL,
    "amount_out" DECIMAL(30,0) NOT NULL,
    "expected_amount_out" DECIMAL(30,0) NOT NULL,
    "slippage_pct" DECIMAL(6,4),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_hops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_analytics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "total_trades" INTEGER NOT NULL DEFAULT 0,
    "successful_trades" INTEGER NOT NULL DEFAULT 0,
    "failed_trades" INTEGER NOT NULL DEFAULT 0,
    "total_profit_usd" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_gas_cost_usd" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_volume_usd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "avg_profit_per_trade_usd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "max_profit_trade_usd" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "avg_execution_time_ms" INTEGER NOT NULL DEFAULT 0,
    "most_profitable_route" JSONB,
    "demand_prediction_hit_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "pool_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "reserve0" DECIMAL(30,0) NOT NULL,
    "reserve1" DECIMAL(30,0) NOT NULL,
    "price_0_in_1" DECIMAL(30,18) NOT NULL,
    "tvl_usd" DECIMAL(20,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pool_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "chain_id" INTEGER,
    "strategy_id" UUID,
    "threshold_value" DECIMAL(14,4),
    "delivery_channel" "AlertChannel" NOT NULL DEFAULT 'dashboard',
    "delivery_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMP(6),
    "trigger_count" INTEGER NOT NULL DEFAULT 0,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alert_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trade_id" UUID,
    "message" TEXT NOT NULL,
    "delivery_status" "AlertDeliveryStatus" NOT NULL DEFAULT 'pending',
    "delivered_at" TIMESTAMP(6),
    "error_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_activity" (
    "id" BIGSERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "bot_address" VARCHAR(42) NOT NULL,
    "route_path" JSONB NOT NULL,
    "estimated_profit_usd" DECIMAL(14,4),
    "gas_used" BIGINT NOT NULL,
    "gas_price_gwei" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
  "resource_type" VARCHAR(50) NOT NULL,
  "resource_id" VARCHAR(100),
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ip_address" VARCHAR(45),
  "user_agent" VARCHAR(500),
  "request_id" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_backup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "WebhookProvider" NOT NULL DEFAULT 'stripe',
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(6),
    "error_message" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER("email"));

-- CreateIndex
CREATE INDEX "users_stripe_customer_id_idx" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_key" ON "refresh_tokens"("replaced_by");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "supported_chains_chain_id_key" ON "supported_chains"("chain_id");

-- CreateIndex
CREATE INDEX "tokens_symbol_idx" ON "tokens"("symbol");

-- CreateIndex
CREATE INDEX "tokens_is_blacklisted_idx" ON "tokens"("is_blacklisted");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_chain_id_address_key" ON "tokens"("chain_id", "address");

-- CreateIndex
CREATE INDEX "pools_dex_idx" ON "pools"("dex");

-- CreateIndex
CREATE INDEX "pools_token0_id_token1_id_idx" ON "pools"("token0_id", "token1_id");

-- CreateIndex
CREATE INDEX "pools_is_active_idx" ON "pools"("is_active");

-- CreateIndex
CREATE INDEX "pools_tvl_usd_idx" ON "pools"("tvl_usd");

-- CreateIndex
CREATE UNIQUE INDEX "pools_chain_id_address_key" ON "pools"("chain_id", "address");

-- CreateIndex
CREATE INDEX "strategies_user_id_idx" ON "strategies"("user_id");

-- CreateIndex
CREATE INDEX "strategies_chain_id_idx" ON "strategies"("chain_id");

-- CreateIndex
CREATE INDEX "strategies_is_active_idx" ON "strategies"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "trades_tx_hash_key" ON "trades"("tx_hash");

-- CreateIndex
CREATE INDEX "trades_strategy_id_idx" ON "trades"("strategy_id");

-- CreateIndex
CREATE INDEX "trades_user_id_idx" ON "trades"("user_id");

-- CreateIndex
CREATE INDEX "trades_chain_id_idx" ON "trades"("chain_id");

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- CreateIndex
CREATE INDEX "trades_block_number_idx" ON "trades"("block_number");

-- CreateIndex
CREATE INDEX "trades_created_at_idx" ON "trades"("created_at");

-- CreateIndex
CREATE INDEX "trades_user_id_created_at_idx" ON "trades"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "trades_chain_id_status_created_at_idx" ON "trades"("chain_id", "status", "created_at");

-- Partitioning note:
-- The product schema specifies monthly partitioning for trades by created_at, but Prisma's
-- relation model requires a globally unique trade id for foreign keys from trade_hops and
-- alert_history. PostgreSQL partitioned primary keys must include the partition key, which
-- would force composite foreign keys that Prisma cannot model here. The durable initial
-- migration therefore keeps the analytics-critical created_at indexes in place and reserves
-- physical partitioning for a dedicated raw SQL follow-up once the trade reference shape can
-- carry the partition key safely.

-- CreateIndex
CREATE INDEX "trade_hops_trade_id_idx" ON "trade_hops"("trade_id");

-- CreateIndex
CREATE UNIQUE INDEX "trade_hops_trade_id_hop_index_key" ON "trade_hops"("trade_id", "hop_index");

-- CreateIndex
CREATE INDEX "daily_analytics_date_idx" ON "daily_analytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_analytics_user_id_chain_id_date_key" ON "daily_analytics"("user_id", "chain_id", "date");

-- CreateIndex
CREATE INDEX "pool_snapshots_pool_id_block_number_idx" ON "pool_snapshots"("pool_id", "block_number");

-- CreateIndex
CREATE INDEX "pool_snapshots_created_at_idx" ON "pool_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "alerts_user_id_idx" ON "alerts"("user_id");

-- CreateIndex
CREATE INDEX "alerts_type_is_active_idx" ON "alerts"("type", "is_active");

-- CreateIndex
CREATE INDEX "alert_history_alert_id_idx" ON "alert_history"("alert_id");

-- CreateIndex
CREATE INDEX "alert_history_user_id_idx" ON "alert_history"("user_id");

-- CreateIndex
CREATE INDEX "alert_history_created_at_idx" ON "alert_history"("created_at");

-- CreateIndex
CREATE INDEX "competitor_activity_chain_id_idx" ON "competitor_activity"("chain_id");

-- CreateIndex
CREATE INDEX "competitor_activity_bot_address_idx" ON "competitor_activity"("bot_address");

-- CreateIndex
CREATE INDEX "competitor_activity_block_number_idx" ON "competitor_activity"("block_number");

-- CreateIndex
CREATE INDEX "competitor_activity_created_at_idx" ON "competitor_activity"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_backup_codes_code_hash_key" ON "two_factor_backup_codes"("code_hash");

-- CreateIndex
CREATE INDEX "two_factor_backup_codes_user_id_idx" ON "two_factor_backup_codes"("user_id");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_token0_id_fkey" FOREIGN KEY ("token0_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pools" ADD CONSTRAINT "pools_token1_id_fkey" FOREIGN KEY ("token1_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_hops" ADD CONSTRAINT "trade_hops_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_hops" ADD CONSTRAINT "trade_hops_token_in_id_fkey" FOREIGN KEY ("token_in_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_hops" ADD CONSTRAINT "trade_hops_token_out_id_fkey" FOREIGN KEY ("token_out_id") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_hops" ADD CONSTRAINT "trade_hops_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_analytics" ADD CONSTRAINT "daily_analytics_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_analytics" ADD CONSTRAINT "daily_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_snapshots" ADD CONSTRAINT "pool_snapshots_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_activity" ADD CONSTRAINT "competitor_activity_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "supported_chains"("chain_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
