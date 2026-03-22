# FlashRoute Full Platform Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build FlashRoute as a production-grade monitoring-first DeFi arbitrage platform, then extend it into a monetizable SaaS with controlled execution and full operational hardening.

**Architecture:** Implement a pnpm TypeScript monorepo with isolated apps for web, API, and workers, plus shared packages for config, database, blockchain contracts, and UI. Establish the full durable schema in Phase B, ship monitoring and analytics before any execution path, and keep billing/admin/execution behind centralized backend enforcement and safety controls.

**Tech Stack:** pnpm workspace, TypeScript, React, Vite, Tailwind, Fastify, Prisma, PostgreSQL, Redis, BullMQ, WebSocket, TanStack Query, Zustand, React Hook Form, Zod, Jest/Vitest/Playwright, Docker, Nginx, GitHub Actions, Solidity/Foundry.

---

## Planning Rules

- Follow `24-BUILD-ORDER.md` as the governing sequence.
- Read and apply every numbered spec file during implementation.
- Use TDD for all major features and hot-path services.
- Keep commits small and phase-aligned.
- Do not enable automated execution by default.
- Do not defer the complete Phase B schema.

---

### Task 1: Create The Monorepo Skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `apps/analytics-engine/package.json`
- Create: `apps/mempool-worker/package.json`
- Create: `apps/executor/package.json`
- Create: `apps/jobs-worker/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/config/package.json`
- Create: `packages/db/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/blockchain/package.json`
- Create: `packages/contracts/package.json`

**Step 1: Write the failing repository bootstrap test**

```bash
pnpm -r exec node -e "process.exit(1)"
```

Expected: fail because the workspace and package scripts do not exist yet.

**Step 2: Create the workspace root files**

Add a root `package.json` with scripts for `lint`, `typecheck`, `test`, `build`, `dev`, and workspace orchestration.

**Step 3: Create app and package manifests**

Add minimal `package.json` files for each planned app/package with consistent naming and script placeholders.

**Step 4: Add shared TypeScript and lint config**

Create the base TypeScript config and root lint/format configuration that all packages extend.

**Step 5: Run the workspace install and validation**

Run: `pnpm install`

Expected: install completes and all workspace packages are recognized.

**Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore .editorconfig .prettierrc.json eslint.config.js apps packages
git commit -m "chore: scaffold flashroute workspace"
```

---

### Task 2: Add Shared Config, Logging, Database, And Redis Foundations

**Files:**
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/index.ts`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/logger.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/redis.ts`
- Create: `packages/shared/src/health.ts`
- Test: `packages/config/src/env.test.ts`
- Test: `packages/db/src/client.test.ts`

**Step 1: Write the failing env validation test**

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('throws when required variables are missing', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @flashroute/config test`

Expected: fail because `loadEnv` does not exist.

**Step 3: Write minimal config implementation**

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
});

export const loadEnv = (env: NodeJS.ProcessEnv) => EnvSchema.parse(env);
```

**Step 4: Add logger, error, DB, and Redis bootstrap modules**

Keep the first version minimal but typed, with explicit connection helpers and health probes.

**Step 5: Run package tests**

Run: `pnpm --filter @flashroute/config test && pnpm --filter @flashroute/db test`

Expected: pass.

**Step 6: Commit**

```bash
git add packages/config packages/shared packages/db
git commit -m "feat: add config and infrastructure foundations"
```

---

### Task 3: Build The Frontend Shell And Design System Foundations

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/layouts/AppShell.tsx`
- Create: `apps/web/src/layouts/AuthLayout.tsx`
- Create: `apps/web/src/layouts/MarketingLayout.tsx`
- Create: `apps/web/src/styles/globals.css`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components/Card.tsx`
- Create: `packages/ui/src/components/Button.tsx`
- Create: `packages/ui/src/components/StatCard.tsx`
- Create: `packages/ui/src/components/LiveIndicator.tsx`
- Create: `apps/web/src/state/ui.store.ts`
- Create: `apps/web/src/state/live.store.ts`
- Test: `apps/web/src/layouts/AppShell.test.tsx`

**Step 1: Write the failing shell render test**

```tsx
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

it('renders the product navigation shell', () => {
  render(<AppShell />);
  expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
});
```

**Step 2: Run the shell test**

Run: `pnpm --filter @flashroute/web test -- AppShell`

Expected: fail because the web app and shell do not exist.

**Step 3: Create the Vite entry, router, providers, and layouts**

Add query client bootstrap, router bootstrap, theme tokens, and shell placeholders matching the required route groups.

**Step 4: Add initial UI primitives and stores**

Create shared Card/Button primitives, shell state, and live connection state.

**Step 5: Run the frontend tests and typecheck**

Run: `pnpm --filter @flashroute/web test && pnpm --filter @flashroute/web typecheck`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/web packages/ui
git commit -m "feat: add frontend shell foundations"
```

---

### Task 4: Implement The Complete Phase B Prisma Schema And Migrations

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_initial/migration.sql`
- Create: `packages/db/src/factories/user.factory.ts`
- Create: `packages/db/src/factories/strategy.factory.ts`
- Create: `packages/db/src/factories/trade.factory.ts`
- Test: `packages/db/prisma/schema.test.ts`

**Files required in the schema:**
- `users`
- `refresh_tokens`
- `api_keys`
- `subscriptions`
- `supported_chains`
- `tokens`
- `pools`
- `strategies`
- `trades`
- `trade_hops`
- `daily_analytics`
- `pool_snapshots`
- `alerts`
- `alert_history`
- `competitor_activity`
- `system_config`
- `audit_logs`
- supporting auth/billing tables needed for 2FA, reset tokens, verification tokens, webhook idempotency, and password history

**Step 1: Write the failing schema coverage test**

```ts
import { readFileSync } from 'node:fs';

it('includes all Phase B core models', () => {
  const schema = readFileSync('packages/db/prisma/schema.prisma', 'utf8');
  for (const model of ['User', 'Strategy', 'Trade', 'Subscription', 'Pool', 'Token', 'AuditLog']) {
    expect(schema).toContain(`model ${model}`);
  }
});
```

**Step 2: Run the schema test**

Run: `pnpm --filter @flashroute/db test -- schema`

Expected: fail until the full schema is present.

**Step 3: Write the full Prisma schema**

Model the complete durable schema now, including indexes, enums, relations, partitions/retention notes, and unique constraints from `02-DATABASE-SCHEMA.md`.

**Step 4: Generate and review the initial migration**

Run: `pnpm --filter @flashroute/db prisma migrate dev --name initial`

Expected: migration generated successfully.

**Step 5: Verify the schema on a fresh database**

Run: `pnpm --filter @flashroute/db prisma migrate reset --force`

Expected: migration applies cleanly.

**Step 6: Commit**

```bash
git add packages/db/prisma packages/db/src/factories
git commit -m "feat: add complete core platform schema"
```

---

### Task 5: Implement The Auth And User Management Backend

**Files:**
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.schemas.ts`
- Create: `apps/api/src/modules/auth/auth.repository.ts`
- Create: `apps/api/src/modules/users/user.routes.ts`
- Create: `apps/api/src/modules/users/user.service.ts`
- Create: `apps/api/src/modules/api-keys/api-keys.routes.ts`
- Create: `apps/api/src/modules/api-keys/api-keys.service.ts`
- Create: `apps/api/src/plugins/auth.ts`
- Test: `apps/api/src/modules/auth/auth.routes.test.ts`
- Test: `apps/api/src/modules/users/user.routes.test.ts`

**Step 1: Write the failing registration flow test**

```ts
it('registers a user and returns session tokens', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: 'user@example.com', password: 'Password123!' },
  });

  expect(response.statusCode).toBe(201);
});
```

**Step 2: Run the auth test**

Run: `pnpm --filter @flashroute/api test -- auth.routes`

Expected: fail because the auth module does not exist.

**Step 3: Implement auth services and routes**

Cover register, login, refresh, logout, forgot/reset password, email verification, 2FA setup/verify/disable, and session invalidation.

**Step 4: Implement profile, security, and API-key endpoints**

Add profile read/update, password change, API-key create/list/revoke, and auth middleware integration.

**Step 5: Run auth and user tests**

Run: `pnpm --filter @flashroute/api test -- auth && pnpm --filter @flashroute/api test -- users`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/modules/users apps/api/src/modules/api-keys apps/api/src/plugins/auth.ts
git commit -m "feat: add authentication and user management api"
```

---

### Task 6: Implement Auth Pages, Session Bootstrap, And Protected Routing

**Files:**
- Create: `apps/web/src/features/auth/pages/LoginPage.tsx`
- Create: `apps/web/src/features/auth/pages/RegisterPage.tsx`
- Create: `apps/web/src/features/auth/pages/ForgotPasswordPage.tsx`
- Create: `apps/web/src/features/auth/pages/ResetPasswordPage.tsx`
- Create: `apps/web/src/features/auth/pages/VerifyEmailPage.tsx`
- Create: `apps/web/src/features/auth/components/TwoFactorChallenge.tsx`
- Create: `apps/web/src/features/auth/api.ts`
- Create: `apps/web/src/state/auth.store.ts`
- Modify: `apps/web/src/app/router.tsx`
- Test: `apps/web/src/features/auth/pages/LoginPage.test.tsx`
- Test: `apps/web/src/app/router.protected.test.tsx`

**Step 1: Write the failing login page test**

```tsx
it('submits credentials and redirects authenticated users', async () => {
  render(<LoginPage />);
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});
```

**Step 2: Run the auth UI tests**

Run: `pnpm --filter @flashroute/web test -- LoginPage`

Expected: fail because auth pages do not exist.

**Step 3: Build the auth route set and forms**

Implement all auth pages with React Hook Form and Zod, including token-based reset/verify flows and 2FA challenge states.

**Step 4: Add auth bootstrap and route protection**

Implement refresh-on-load, protected route wrappers, and safe `redirectTo` handling.

**Step 5: Run the frontend auth suite**

Run: `pnpm --filter @flashroute/web test -- auth && pnpm --filter @flashroute/web typecheck`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/web/src/features/auth apps/web/src/state/auth.store.ts apps/web/src/app/router.tsx
git commit -m "feat: add auth pages and protected routing"
```

---

### Task 7: Build Pool Indexing, Metadata, And Cache Foundations

**Files:**
- Create: `apps/analytics-engine/src/bootstrap.ts`
- Create: `apps/analytics-engine/src/modules/pools/pool-indexer.ts`
- Create: `apps/analytics-engine/src/modules/pools/pool-normalizer.ts`
- Create: `apps/analytics-engine/src/modules/tokens/token-registry.ts`
- Create: `apps/analytics-engine/src/modules/chains/chain-manager.ts`
- Create: `packages/blockchain/src/amm/uniswap-v2.ts`
- Create: `packages/blockchain/src/amm/uniswap-v3.ts`
- Create: `packages/blockchain/src/amm/curve.ts`
- Create: `packages/blockchain/src/amm/balancer.ts`
- Test: `apps/analytics-engine/src/modules/pools/pool-indexer.test.ts`
- Test: `packages/blockchain/src/amm/uniswap-v2.test.ts`

**Step 1: Write the failing pool indexing test**

```ts
it('normalizes discovered pools into Redis cache entries', async () => {
  const result = await indexPools();
  expect(result.indexed).toBeGreaterThan(0);
});
```

**Step 2: Run the analytics-engine pool test**

Run: `pnpm --filter @flashroute/analytics-engine test -- pool-indexer`

Expected: fail because the indexer does not exist.

**Step 3: Implement metadata and indexing modules**

Fetch supported chains, token metadata, and pool data, then normalize reserves/fees into hot cache models.

**Step 4: Implement base AMM math helpers**

Add deterministic pool math libraries for the supported AMM families.

**Step 5: Run math and indexing tests**

Run: `pnpm --filter @flashroute/analytics-engine test && pnpm --filter @flashroute/blockchain test`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/analytics-engine packages/blockchain
git commit -m "feat: add pool indexing and amm math foundations"
```

---

### Task 8: Implement Graph Construction And Route Discovery

**Files:**
- Create: `apps/analytics-engine/src/modules/graph/graph-builder.ts`
- Create: `apps/analytics-engine/src/modules/routes/route-discovery.ts`
- Create: `apps/analytics-engine/src/modules/routes/route-ranking.ts`
- Create: `packages/shared/src/contracts/opportunity.ts`
- Test: `apps/analytics-engine/src/modules/graph/graph-builder.test.ts`
- Test: `apps/analytics-engine/src/modules/routes/route-discovery.test.ts`

**Step 1: Write the failing route discovery test**

```ts
it('finds profitable cycles from normalized pool edges', async () => {
  const routes = discoverRoutes(sampleGraph);
  expect(routes.length).toBeGreaterThan(0);
});
```

**Step 2: Run the route discovery tests**

Run: `pnpm --filter @flashroute/analytics-engine test -- route-discovery`

Expected: fail because the graph engine is missing.

**Step 3: Implement graph construction**

Model tokens as vertices, pools as directed edges, and include sampled executable edge metadata.

**Step 4: Implement bounded-hop cycle search and ranking**

Use the negative-cycle search approach described in `04-ALGORITHMS.md`, then deduplicate and rank candidates.

**Step 5: Run route engine tests**

Run: `pnpm --filter @flashroute/analytics-engine test -- graph && pnpm --filter @flashroute/analytics-engine test -- routes`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/analytics-engine/src/modules/graph apps/analytics-engine/src/modules/routes packages/shared/src/contracts/opportunity.ts
git commit -m "feat: add route graph discovery engine"
```

---

### Task 9: Implement Demand Prediction And Profit Simulation

**Files:**
- Create: `apps/mempool-worker/src/bootstrap.ts`
- Create: `apps/mempool-worker/src/modules/mempool/mempool-monitor.ts`
- Create: `apps/mempool-worker/src/modules/mempool/tx-decoder.ts`
- Create: `apps/mempool-worker/src/modules/prediction/demand-predictor.ts`
- Create: `apps/executor/src/modules/simulation/profit-simulator.ts`
- Create: `apps/executor/src/modules/simulation/gas-estimator.ts`
- Test: `apps/mempool-worker/src/modules/prediction/demand-predictor.test.ts`
- Test: `apps/executor/src/modules/simulation/profit-simulator.test.ts`

**Step 1: Write the failing demand prediction test**

```ts
it('projects reserve deltas from decoded pending swaps', async () => {
  const prediction = await predictDemand(samplePendingSwaps);
  expect(prediction.impactedPools.length).toBeGreaterThan(0);
});
```

**Step 2: Run the prediction and simulation tests**

Run: `pnpm --filter @flashroute/mempool-worker test -- demand-predictor && pnpm --filter @flashroute/executor test -- profit-simulator`

Expected: fail because the predictive and simulation services do not exist.

**Step 3: Implement mempool decoding and reserve projections**

Decode pending swaps, score confidence, and apply temporary projected state overlays.

**Step 4: Implement profit simulation**

Compute gas-aware, fee-aware, slippage-aware net profit and choose optimal input size with bounded search.

**Step 5: Run prediction and simulation tests**

Run: `pnpm --filter @flashroute/mempool-worker test && pnpm --filter @flashroute/executor test -- simulation`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/mempool-worker apps/executor/src/modules/simulation
git commit -m "feat: add demand prediction and profit simulation"
```

---

### Task 10: Implement Opportunities API, WebSocket Fanout, Dashboard Stats, And Opportunities UI

**Files:**
- Create: `apps/api/src/modules/opportunities/opportunities.routes.ts`
- Create: `apps/api/src/modules/opportunities/opportunities.service.ts`
- Create: `apps/api/src/modules/live/live.gateway.ts`
- Create: `apps/api/src/modules/dashboard/dashboard.routes.ts`
- Create: `apps/web/src/features/dashboard/pages/DashboardPage.tsx`
- Create: `apps/web/src/features/opportunities/pages/OpportunitiesPage.tsx`
- Create: `apps/web/src/features/opportunities/components/OpportunityTable.tsx`
- Create: `apps/web/src/features/live/useLiveOpportunities.ts`
- Test: `apps/api/src/modules/opportunities/opportunities.routes.test.ts`
- Test: `apps/web/src/features/opportunities/pages/OpportunitiesPage.test.tsx`

**Step 1: Write the failing opportunities API test**

```ts
it('returns ranked opportunities from the hot cache', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/opportunities' });
  expect(response.statusCode).toBe(200);
});
```

**Step 2: Run API and UI tests**

Run: `pnpm --filter @flashroute/api test -- opportunities && pnpm --filter @flashroute/web test -- OpportunitiesPage`

Expected: fail because the routes and pages do not exist.

**Step 3: Implement opportunities and dashboard endpoints**

Serve cached opportunities, dashboard aggregates, and a typed WebSocket subscription model.

**Step 4: Build the dashboard and opportunities pages**

Add loading, error, empty, loaded, disconnected, and stale-with-data states.

**Step 5: Run the monitoring MVP verification**

Run: `pnpm --filter @flashroute/api test -- opportunities && pnpm --filter @flashroute/web test -- dashboard && pnpm --filter @flashroute/web test -- opportunities`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/opportunities apps/api/src/modules/live apps/api/src/modules/dashboard apps/web/src/features/dashboard apps/web/src/features/opportunities
git commit -m "feat: deliver monitoring dashboard and opportunities feed"
```

---

### Task 11: Implement Strategy Management Across API And Web

**Files:**
- Create: `apps/api/src/modules/strategies/strategies.routes.ts`
- Create: `apps/api/src/modules/strategies/strategies.service.ts`
- Create: `apps/api/src/modules/strategies/strategies.schemas.ts`
- Create: `apps/web/src/features/strategies/pages/StrategyListPage.tsx`
- Create: `apps/web/src/features/strategies/pages/StrategyCreatePage.tsx`
- Create: `apps/web/src/features/strategies/pages/StrategyDetailPage.tsx`
- Create: `apps/web/src/features/strategies/pages/StrategyEditPage.tsx`
- Create: `apps/web/src/features/strategies/components/StrategyForm.tsx`
- Test: `apps/api/src/modules/strategies/strategies.routes.test.ts`
- Test: `apps/web/src/features/strategies/components/StrategyForm.test.tsx`

**Step 1: Write the failing strategy creation test**

```ts
it('creates a disabled strategy with validated thresholds', async () => {
  const response = await app.inject({ method: 'POST', url: '/v1/strategies', payload: sampleStrategy });
  expect(response.statusCode).toBe(201);
});
```

**Step 2: Run strategy tests**

Run: `pnpm --filter @flashroute/api test -- strategies && pnpm --filter @flashroute/web test -- StrategyForm`

Expected: fail because the strategy modules do not exist.

**Step 3: Implement strategy CRUD and activation guards**

Validate DEX/chain filters, thresholds, and entitlement prerequisites before allowing activation.

**Step 4: Build strategy pages and forms**

Add optimistic toggles only where safe, detailed validation copy, and four-state page behavior.

**Step 5: Run strategy API and UI tests**

Run: `pnpm --filter @flashroute/api test -- strategies && pnpm --filter @flashroute/web test -- strategies`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/strategies apps/web/src/features/strategies
git commit -m "feat: add strategy management workflows"
```

---

### Task 12: Implement Trades And Analytics Across API And Web

**Files:**
- Create: `apps/api/src/modules/trades/trades.routes.ts`
- Create: `apps/api/src/modules/trades/trades.service.ts`
- Create: `apps/api/src/modules/analytics/analytics.routes.ts`
- Create: `apps/api/src/modules/analytics/analytics.service.ts`
- Create: `apps/jobs-worker/src/modules/analytics/daily-aggregator.ts`
- Create: `apps/jobs-worker/src/modules/analytics/competitor-tracker.ts`
- Create: `apps/web/src/features/trades/pages/TradesPage.tsx`
- Create: `apps/web/src/features/trades/pages/TradeDetailPage.tsx`
- Create: `apps/web/src/features/analytics/pages/AnalyticsPage.tsx`
- Test: `apps/api/src/modules/trades/trades.routes.test.ts`
- Test: `apps/web/src/features/trades/pages/TradesPage.test.tsx`
- Test: `apps/web/src/features/analytics/pages/AnalyticsPage.test.tsx`

**Step 1: Write the failing trade history test**

```ts
it('returns paginated trades with filters and summaries', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/trades' });
  expect(response.statusCode).toBe(200);
});
```

**Step 2: Run trade and analytics tests**

Run: `pnpm --filter @flashroute/api test -- trades && pnpm --filter @flashroute/web test -- TradesPage`

Expected: fail because the modules do not exist.

**Step 3: Implement trade read models and analytics endpoints**

Support list/detail/filtering for trades and overview/routes/competitors/gas analytics endpoints.

**Step 4: Implement jobs-worker aggregations and frontend pages**

Build daily aggregation jobs, competitor tracking jobs, and the trades and analytics UIs.

**Step 5: Run verification for product-depth features**

Run: `pnpm --filter @flashroute/api test -- trades && pnpm --filter @flashroute/api test -- analytics && pnpm --filter @flashroute/web test -- trades && pnpm --filter @flashroute/web test -- analytics`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/trades apps/api/src/modules/analytics apps/jobs-worker/src/modules/analytics apps/web/src/features/trades apps/web/src/features/analytics
git commit -m "feat: add trade history and analytics surfaces"
```

---

### Task 13: Implement Billing, Entitlements, API Keys, Alerts, And Marketing Pages

**Files:**
- Create: `apps/api/src/modules/billing/billing.routes.ts`
- Create: `apps/api/src/modules/billing/billing.service.ts`
- Create: `apps/api/src/modules/billing/webhooks/stripe-webhook.ts`
- Create: `apps/api/src/modules/entitlements/entitlements.service.ts`
- Create: `apps/api/src/modules/alerts/alerts.routes.ts`
- Create: `apps/jobs-worker/src/modules/alerts/alert-runner.ts`
- Create: `apps/web/src/features/billing/pages/BillingPage.tsx`
- Create: `apps/web/src/features/settings/pages/ApiKeysPage.tsx`
- Create: `apps/web/src/features/marketing/pages/LandingPage.tsx`
- Create: `apps/web/src/features/marketing/pages/PricingPage.tsx`
- Create: `apps/web/src/features/marketing/pages/SecurityPage.tsx`
- Create: `apps/web/src/features/marketing/pages/FaqPage.tsx`
- Create: `apps/web/src/features/marketing/pages/DocsPreviewPage.tsx`
- Test: `apps/api/src/modules/billing/billing.routes.test.ts`
- Test: `apps/api/src/modules/entitlements/entitlements.service.test.ts`
- Test: `apps/web/src/features/billing/pages/BillingPage.test.tsx`

**Step 1: Write the failing entitlement test**

```ts
it('maps subscription state into feature entitlements', async () => {
  const entitlements = await resolveEntitlements(sampleSubscription);
  expect(entitlements.canViewRealtimeOpportunities).toBe(true);
});
```

**Step 2: Run billing and entitlement tests**

Run: `pnpm --filter @flashroute/api test -- entitlements && pnpm --filter @flashroute/web test -- BillingPage`

Expected: fail because billing services do not exist.

**Step 3: Implement Stripe and entitlement resolution**

Support checkout, portal handoff, webhook idempotency, subscription sync, grace periods, and downgrade handling.

**Step 4: Build billing, API key, alert, and marketing flows**

Add billing UI, API-key management UI, alerts settings, and public acquisition pages.

**Step 5: Run commercial-layer tests**

Run: `pnpm --filter @flashroute/api test -- billing && pnpm --filter @flashroute/api test -- entitlements && pnpm --filter @flashroute/web test -- billing && pnpm --filter @flashroute/web test -- marketing`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/billing apps/api/src/modules/entitlements apps/api/src/modules/alerts apps/jobs-worker/src/modules/alerts apps/web/src/features/billing apps/web/src/features/settings apps/web/src/features/marketing
git commit -m "feat: add billing entitlements and marketing flows"
```

---

### Task 14: Implement Admin Surfaces And Runtime Controls

**Files:**
- Create: `apps/api/src/modules/admin/admin-users.routes.ts`
- Create: `apps/api/src/modules/admin/admin-system.routes.ts`
- Create: `apps/api/src/modules/admin/admin.service.ts`
- Create: `apps/api/src/modules/config/runtime-config.service.ts`
- Create: `apps/web/src/features/admin/pages/AdminUsersPage.tsx`
- Create: `apps/web/src/features/admin/pages/AdminSystemPage.tsx`
- Create: `apps/web/src/features/admin/components/SystemHealthGrid.tsx`
- Test: `apps/api/src/modules/admin/admin.routes.test.ts`
- Test: `apps/web/src/features/admin/pages/AdminSystemPage.test.tsx`

**Step 1: Write the failing admin guard test**

```ts
it('blocks non-admin users from system endpoints', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/admin/system' });
  expect(response.statusCode).toBe(403);
});
```

**Step 2: Run admin tests**

Run: `pnpm --filter @flashroute/api test -- admin && pnpm --filter @flashroute/web test -- AdminSystemPage`

Expected: fail because the admin system is missing.

**Step 3: Implement admin endpoints and runtime config controls**

Add user management, health visibility, maintenance mode, config hot reload, pause/resume/resync actions, and auditable admin mutations.

**Step 4: Build admin users and system pages**

Render worker health, queue state, config panels, and dangerous-action confirmations.

**Step 5: Run admin verification**

Run: `pnpm --filter @flashroute/api test -- admin && pnpm --filter @flashroute/web test -- admin`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/admin apps/api/src/modules/config apps/web/src/features/admin
git commit -m "feat: add admin controls and system health views"
```

---

### Task 15: Implement The Execution Contract, Backend Execution Engine, And Safety Gates

**Files:**
- Create: `packages/contracts/src/FlashRouteExecutor.sol`
- Create: `packages/contracts/test/FlashRouteExecutor.t.sol`
- Create: `apps/executor/src/modules/execution/flash-loan-provider.ts`
- Create: `apps/executor/src/modules/execution/execution-engine.ts`
- Create: `apps/executor/src/modules/execution/flashbots-submitter.ts`
- Create: `apps/executor/src/modules/execution/nonce-manager.ts`
- Create: `apps/executor/src/modules/execution/safety-controller.ts`
- Create: `apps/api/src/modules/execution/execution.routes.ts`
- Test: `apps/executor/src/modules/execution/execution-engine.test.ts`
- Test: `apps/api/src/modules/execution/execution.routes.test.ts`

**Step 1: Write the failing safety controller test**

```ts
it('blocks execution when the global execution flag is disabled', async () => {
  await expect(maybeExecute(sampleOpportunity)).rejects.toThrow(/disabled/i);
});
```

**Step 2: Run execution tests**

Run: `pnpm --filter @flashroute/executor test -- execution-engine && pnpm --filter @flashroute/contracts test`

Expected: fail because the execution stack does not exist.

**Step 3: Implement the executor contract and execution services**

Add flash-loan callbacks, route calldata packing, provider abstraction, private relay submission, nonce handling, and result tracking.

**Step 4: Implement safety gating**

Add global execution enable flag, health-linked auto-pause, simulation freshness checks, drift monitoring, and emergency pause controls.

**Step 5: Run execution verification**

Run: `pnpm --filter @flashroute/contracts test && pnpm --filter @flashroute/executor test && pnpm --filter @flashroute/api test -- execution`

Expected: pass, with execution still disabled by default.

**Step 6: Commit**

```bash
git add packages/contracts apps/executor/src/modules/execution apps/api/src/modules/execution
git commit -m "feat: add controlled execution engine with safety gates"
```

---

### Task 16: Complete Frontend, Backend, And End-To-End Testing

**Files:**
- Create: `apps/web/src/test/render-with-providers.tsx`
- Create: `apps/web/src/test/server.ts`
- Create: `apps/api/src/test/build-test-app.ts`
- Create: `apps/api/src/test/factories.ts`
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/monitoring.spec.ts`
- Create: `tests/e2e/billing.spec.ts`
- Create: `tests/e2e/admin.spec.ts`
- Create: `tests/e2e/execution-safety.spec.ts`
- Modify: root `package.json`

**Step 1: Write the failing end-to-end smoke test**

```ts
import { test, expect } from '@playwright/test';

test('user can sign in and view opportunities', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText(/sign in/i)).toBeVisible();
});
```

**Step 2: Run the e2e smoke suite**

Run: `pnpm exec playwright test tests/e2e/auth.spec.ts`

Expected: fail until the app and harness are ready.

**Step 3: Add test utilities and mock infrastructure**

Create provider wrappers, MSW setup, WebSocket fixtures, API test builders, and Playwright config.

**Step 4: Add the required regression suites**

Cover auth, strategies, live opportunities, billing, admin guards, and execution safety toggles.

**Step 5: Run the consolidated test suites**

Run: `pnpm test && pnpm exec playwright test`

Expected: pass.

**Step 6: Commit**

```bash
git add apps/web/src/test apps/api/src/test tests/e2e package.json
git commit -m "test: add platform integration and e2e coverage"
```

---

### Task 17: Add Deployment Artifacts, Documentation, And Quality Gates

**Files:**
- Create: `Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/api/Dockerfile`
- Create: `apps/analytics-engine/Dockerfile`
- Create: `apps/mempool-worker/Dockerfile`
- Create: `apps/executor/Dockerfile`
- Create: `apps/jobs-worker/Dockerfile`
- Create: `docker-compose.yml`
- Create: `infra/nginx/nginx.conf`
- Create: `.github/workflows/ci.yml`
- Create: `docs/README.md`
- Create: `docs/environment.md`
- Create: `docs/operator-setup.md`
- Create: `docs/api-reference.md`
- Create: `docs/execution-safety.md`
- Create: `docs/runbooks/admin-runbook.md`
- Create: `docs/runbooks/incident-recovery.md`
- Create: `docs/releases/CHANGELOG.md`
- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`

**Step 1: Write the failing deployment smoke script**

```bash
docker compose config
```

Expected: fail because no deployment files exist yet.

**Step 2: Create Docker, compose, Nginx, and CI artifacts**

Ensure every service has a reproducible container build and the CI pipeline runs lint, typecheck, tests, and build.

**Step 3: Write the required operator and product documentation**

Cover setup, env vars, API, execution safety, admin operations, incident recovery, and release notes.

**Step 4: Add quality gate documentation and scripts**

Encode the release checklist from `23-QUALITY-GATES.md` into CI jobs and human-readable docs.

**Step 5: Run deployment and docs verification**

Run: `docker compose config && pnpm build && pnpm test`

Expected: pass.

**Step 6: Commit**

```bash
git add Dockerfile apps infra .github docs scripts docker-compose.yml
git commit -m "chore: add deployment docs and release gates"
```

---

## Milestone Checkpoints

### Milestone 1: Authenticated Monitoring MVP

Must pass:

- Tasks 1-10 complete
- frontend boots
- API boots
- migrations apply cleanly
- auth works end-to-end
- dashboard and opportunities pages render live data
- execution remains disabled

### Milestone 2: Operator Analytics MVP

Must pass:

- Tasks 11-12 complete
- strategy CRUD is stable
- trades and analytics pages are usable
- aggregations run through jobs-worker

### Milestone 3: Commercial SaaS MVP

Must pass:

- Tasks 13-14 complete
- billing and entitlements are enforced server-side
- marketing funnel is live
- admin controls are auditable and guarded

### Milestone 4: Controlled Execution Release Candidate

Must pass:

- Task 15 complete
- safety gates block unsafe execution
- emergency pause works
- execution remains opt-in and explicitly controlled

### Milestone 5: Production Readiness

Must pass:

- Tasks 16-17 complete
- CI is green
- docs are current
- deploy artifacts are reproducible
- release checklist from `23-QUALITY-GATES.md` passes

---

## Cross-Phase Notes

- Do not split the schema into ad hoc migrations by feature area after Phase B begins.
- Keep WebSocket updates additive to query cache, not a separate frontend source of truth.
- Keep execution secrets and signing paths isolated from the public API app.
- Prefer mocked chain data and deterministic fixtures until hot-path math and entitlement logic are stable.
- Treat CSV export and session-device management as explicitly deferred unless the API support is implemented.

---

## Suggested Execution Mode

Implement this plan milestone by milestone, with code review and verification after each task or small task bundle.

Plan complete and saved to `docs/plans/2026-03-21-flashroute-full-platform-roadmap.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
