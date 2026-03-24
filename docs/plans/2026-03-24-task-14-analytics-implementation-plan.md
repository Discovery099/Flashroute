# Task 14 Analytics Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Analytics page (`/analytics`) with Overview, Routes, Competitors, and Gas tabs. Backend provides 5 analytics REST endpoints. Frontend renders 4 chart components and 3 data tables.

**Architecture:** Analytics module in `apps/api/src/modules/analytics/` with repository pattern over existing `trades`, `competitor_activity`, and `daily_analytics` tables. Frontend uses TanStack Query per tab, Recharts for visualizations, URL-persistent tab/period/chain params.

**Tech Stack:** Fastify routes + service + repository, Recharts charts, TanStack Query hooks, Zod validation, `@flashroute/ui` primitives.

---

## Prerequisites

- Worktree: `phase-d-task-14` branched from `phase-d-task-13` HEAD
- `recharts` added to `apps/web/package.json`
- `FakePrismaClient` extended with `competitorActivity` for tests
- Design doc: `docs/plans/2026-03-24-task-14-analytics-pages-design.md`

---

## Task 14.1: Backend — Analytics Schemas and Types

**Files:**
- Create: `apps/api/src/modules/analytics/analytics.schemas.ts`
- Create: `apps/api/src/modules/analytics/analytics.types.ts`

**Step 1: Write the type definitions and Zod schemas**

```typescript
// apps/api/src/modules/analytics/analytics.types.ts
export const PERIOD_VALUES = ['7d', '30d', '90d', 'all'] as const;
export type Period = typeof PERIOD_VALUES[number];

export const CHAIN_IDS = [1, 42161, 10, 137] as const;

export interface AnalyticsOverviewData {
  profitTrend: Array<{ date: string; cumulativeProfitUsd: number }>;
  volumeTrend: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
  successRateTrend: Array<{ date: string; successRate: number }>;
  dailyBreakdown: Array<{
    date: string;
    grossProfitUsd: number;
    gasCostUsd: number;
    netProfitUsd: number;
    tradeCount: number;
  }>;
}

export interface RouteAnalytics {
  routeKey: string;
  dexes: string;
  executionCount: number;
  successCount: number;
  totalProfitUsd: number;
  avgProfitUsd: number;
  avgSlippagePct: number;
  avgExecutionTimeMs: number;
  lastExecutedAt: string;
}

export interface CompetitorData {
  botAddress: string;
  tradeCount: number;
  estimatedProfitUsd: number;
  avgGasPriceGwei: number;
  mostUsedRoutes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface GasAnalytics {
  currentBaseFeeGwei: number | null;
  avgBaseFee24h: null;        // requires Phase G
  avgPriorityFee24h: null;    // requires Phase G
  ourAvgGasCost: number | null;
  gasSpentTotalUsd: number | null;
  gasSavedByFlashbotsUsd: null; // requires Phase G
  optimalExecutionHours: null;  // requires Phase G
  gasTrend: Array<{ hour: string; avgBaseFeeGwei: number | null; avgPriorityFeeGwei: number | null }>;
}
```

```typescript
// apps/api/src/modules/analytics/analytics.schemas.ts
import { z } from 'zod';

export const PERIOD_VALUES = ['7d', '30d', '90d', 'all'] as const;
export type Period = typeof PERIOD_VALUES[number];

export const analyticsPeriodSchema = z.enum(PERIOD_VALUES).default('7d');

export const baseAnalyticsQuerySchema = z.object({
  chainId: z.string().transform((v) => (v ? Number(v) : undefined)).optional(),
  period: analyticsPeriodSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsDashboardQuerySchema = baseAnalyticsQuerySchema.extend({
  period: analyticsPeriodSchema.default('7d'),
});

export const analyticsOverviewQuerySchema = baseAnalyticsQuerySchema.extend({
  period: analyticsPeriodSchema.default('7d'),
});

export const analyticsDailyQuerySchema = baseAnalyticsQuerySchema.extend({
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsRoutesQuerySchema = baseAnalyticsQuerySchema.extend({
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsCompetitorsQuerySchema = z.object({
  chainId: z.string().transform((v) => (v ? Number(v) : undefined)).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const analyticsGasQuerySchema = z.object({
  chainId: z.string().transform((v) => (v ? Number(v) : undefined)).optional(),
  period: analyticsPeriodSchema.default('7d'),
});

export type BaseAnalyticsQuery = z.infer<typeof baseAnalyticsQuerySchema>;
export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;
export type AnalyticsDailyQuery = z.infer<typeof analyticsDailyQuerySchema>;
export type AnalyticsRoutesQuery = z.infer<typeof analyticsRoutesQuerySchema>;
export type AnalyticsCompetitorsQuery = z.infer<typeof analyticsCompetitorsQuerySchema>;
export type AnalyticsGasQuery = z.infer<typeof analyticsGasQuerySchema>;
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.types.ts apps/api/src/modules/analytics/analytics.schemas.ts
git commit -m "feat(analytics): add type definitions and Zod schemas"
```

---

## Task 14.2: Backend — Analytics Repository

**Files:**
- Create: `apps/api/src/modules/analytics/analytics.repository.ts`

**Step 1: Write the repository with all SQL aggregation queries**

The repository implements `TradesRepository`-style interface but for analytics aggregates. All aggregation queries use existing tables — no new migrations needed.

```typescript
// apps/api/src/modules/analytics/analytics.repository.ts
import type { PrismaTradesClientLike } from '../../test/test-harness';
import type {
  AnalyticsOverviewData,
  RouteAnalytics,
  CompetitorData,
  GasAnalytics,
  BaseAnalyticsQuery,
  AnalyticsDailyQuery,
  AnalyticsCompetitorsQuery,
} from './analytics.types';

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

// NOTE: These SQL aggregations are candidates for pre-aggregation (e.g., nightly
// jobs-worker job writing to daily_analytics) when trade volume exceeds ~10k rows/user.
export class AnalyticsRepository {
  public constructor(private readonly prisma: PrismaTradesClientLike) {}

  public async getOverview(userId: string, query: BaseAnalyticsQuery) {
    const [startDate, endDate] = makeDateRange(query.period, query.startDate, query.endDate);
    const where: Record<string, unknown> = {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    };
    if (query.chainId) where.chainId = query.chainId;

    const rows = await this.prisma.trade.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        status: true,
        netProfitUsd: true,
        gasCostUsd: true,
        profitUsd: true,
      },
    });

    // Group by date
    const byDate = new Map<string, { gross: number; gas: number; net: number; total: number; success: number; fail: number }>();
    let cumulative = 0;
    const profitTrend: Array<{ date: string; cumulativeProfitUsd: number }> = [];
    const volumeTrend: Array<{ date: string; tradeCount: number; volumeUsd: number }> = [];
    const successRateTrend: Array<{ date: string; successRate: number }> = [];
    const dailyBreakdown: Array<{ date: string; grossProfitUsd: number; gasCostUsd: number; netProfitUsd: number; tradeCount: number }> = [];

    for (const row of rows) {
      const dateKey = row.createdAt.toISOString().split('T')[0]!];
      const existing = byDate.get(dateKey) ?? { gross: 0, gas: 0, net: 0, total: 0, success: 0, fail: 0 };
      const net = decimalToNumber(row.netProfitUsd);
      const gross = decimalToNumber(row.profitUsd);
      const gas = decimalToNumber(row.gasCostUsd);
      existing.gross += gross;
      existing.gas += gas;
      existing.net += net;
      existing.total += 1;
      if (['settled', 'included'].includes(row.status)) existing.success += 1;
      else if (['reverted', 'failed'].includes(row.status)) existing.fail += 1;
      byDate.set(dateKey, existing);
    }

    for (const [date, stats] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      cumulative += stats.net;
      profitTrend.push({ date, cumulativeProfitUsd: Math.round(cumulative * 100) / 100 });
      volumeTrend.push({ date, tradeCount: stats.total, volumeUsd: Math.round(stats.gross * 100) / 100 });
      const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 10000) / 100 : 0;
      successRateTrend.push({ date, successRate });
      dailyBreakdown.push({
        date,
        grossProfitUsd: Math.round(stats.gross * 100) / 100,
        gasCostUsd: Math.round(stats.gas * 100) / 100,
        netProfitUsd: Math.round(stats.net * 100) / 100,
        tradeCount: stats.total,
      });
    }

    return { profitTrend, volumeTrend, successRateTrend, dailyBreakdown };
  }

  public async getRoutes(userId: string, query: BaseAnalyticsQuery & { strategyId?: string; startDate?: string; endDate?: string; limit: number }) {
    const [startDate, endDate] = makeDateRange(query.period, query.startDate, query.endDate);
    const where: Record<string, unknown> = {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    };
    if (query.chainId) where.chainId = query.chainId;
    if (query.strategyId) where.strategyId = query.strategyId;

    const rows = await this.prisma.trade.findMany({
      where,
      select: {
        routePath: true,
        status: true,
        netProfitUsd: true,
        gasUsed: true,
        slippagePct: true,
        createdAt: true,
      },
    });

    // Aggregate by routePath
    const routeMap = new Map<string, {
      executionCount: number;
      successCount: number;
      totalProfit: number;
      totalSlippage: number;
      totalExecutionTime: number;
      lastExecutedAt: Date;
    }>();

    for (const row of rows) {
      const key = this.serializeRoutePath(row.routePath);
      const existing = routeMap.get(key) ?? {
        executionCount: 0, successCount: 0, totalProfit: 0,
        totalSlippage: 0, totalExecutionTime: 0, lastExecutedAt: row.createdAt,
      };
      existing.executionCount += 1;
      if (['settled', 'included'].includes(row.status)) existing.successCount += 1;
      existing.totalProfit += decimalToNumber(row.netProfitUsd);
      existing.totalSlippage += decimalToNumber(row.slippagePct);
      existing.totalExecutionTime += Number(row.gasUsed) || 0;
      if (row.createdAt > existing.lastExecutedAt) existing.lastExecutedAt = row.createdAt;
      routeMap.set(key, existing);
    }

    const routes: RouteAnalytics[] = [...routeMap.entries()]
      .sort((a, b) => b[1].totalProfit - a[1].totalProfit)
      .slice(0, query.limit)
      .map(([routeKey, stats]) => ({
        routeKey,
        dexes: 'unknown', // routePath JSON doesn't include dex in current schema
        executionCount: stats.executionCount,
        successCount: stats.successCount,
        totalProfitUsd: Math.round(stats.totalProfit * 100) / 100,
        avgProfitUsd: Math.round((stats.totalProfit / stats.executionCount) * 100) / 100,
        avgSlippagePct: Math.round((stats.totalSlippage / stats.executionCount) * 10000) / 10000,
        avgExecutionTimeMs: Math.round(stats.totalExecutionTime / stats.executionCount),
        lastExecutedAt: stats.lastExecutedAt.toISOString(),
      }));

    return { routes };
  }

  public async getCompetitors(query: AnalyticsCompetitorsQuery) {
    const [startDate, endDate] = makeDateRange(undefined, query.startDate, query.endDate);
    const where: Record<string, unknown> = { createdAt: { gte: startDate, lte: endDate } };
    if (query.chainId) where.chainId = query.chainId;

    const rows = await (this.prisma as any).competitorActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate by botAddress
    const botMap = new Map<string, {
      tradeCount: number;
      estimatedProfit: number;
      totalGasPrice: number;
      routes: string[];
      firstSeen: Date;
      lastSeen: Date;
    }>();

    for (const row of rows as any[]) {
      const addr = row.botAddress;
      const existing = botMap.get(addr) ?? {
        tradeCount: 0, estimatedProfit: 0, totalGasPrice: 0,
        routes: [], firstSeen: row.createdAt, lastSeen: row.createdAt,
      };
      existing.tradeCount += 1;
      existing.estimatedProfit += decimalToNumber(row.estimatedProfitUsd);
      existing.totalGasPrice += decimalToNumber(row.gasPriceGwei);
      const routeStr = this.serializeRoutePath(row.routePath);
      if (!existing.routes.includes(routeStr)) existing.routes.push(routeStr);
      if (row.createdAt < existing.firstSeen) existing.firstSeen = row.createdAt;
      if (row.createdAt > existing.lastSeen) existing.lastSeen = row.createdAt;
      botMap.set(addr, existing);
    }

    const competitors: CompetitorData[] = [...botMap.entries()]
      .sort((a, b) => b[1].estimatedProfit - a[1].estimatedProfit)
      .slice(0, query.limit)
      .map(([botAddress, stats]) => ({
        botAddress,
        tradeCount: stats.tradeCount,
        estimatedProfitUsd: Math.round(stats.estimatedProfit * 100) / 100,
        avgGasPriceGwei: Math.round((stats.totalGasPrice / stats.tradeCount) * 100) / 100,
        mostUsedRoutes: stats.routes.slice(0, 3),
        firstSeenAt: stats.firstSeen.toISOString(),
        lastSeenAt: stats.lastSeen.toISOString(),
      }));

    const totalCompetitorTrades = rows.length;

    // ourWinRate is null until Phase G jobs-worker populates daily_analytics.competitor_stats
    return { competitors, totalCompetitorTrades, ourWinRate: null };
  }

  public async getGas(userId: string, query: { chainId?: number; period?: string }) {
    const [startDate, endDate] = makeDateRange(query.period);

    const where: Record<string, unknown> = { userId };
    if (query.chainId) where.chainId = query.chainId;

    const rows = await this.prisma.trade.findMany({
      where: {
        ...where,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        gasCostUsd: true,
        gasUsed: true,
        gasPriceGwei: true,
        createdAt: true,
      },
    });

    const gasSpentTotalUsd = rows.reduce((sum, r) => sum + decimalToNumber(r.gasCostUsd), 0);
    const ourAvgGasCost = rows.length > 0 ? gasSpentTotalUsd / rows.length : null;

    // gasTrend: hourly aggregation for last 24h
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    const hourlyMap = new Map<string, { totalBaseFee: number; totalPriorityFee: number; count: number }>();
    for (const row of rows) {
      if (row.createdAt < last24h) continue;
      const hourKey = row.createdAt.toISOString().substring(0, 13) + ':00:00.000Z';
      const existing = hourlyMap.get(hourKey) ?? { totalBaseFee: 0, totalPriorityFee: 0, count: 0 };
      existing.totalBaseFee += decimalToNumber(row.gasPriceGwei);
      existing.totalPriorityFee += 0; // not available in trades table
      existing.count += 1;
      hourlyMap.set(hourKey, existing);
    }
    const gasTrend = [...hourlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, stats]) => ({
        hour,
        avgBaseFeeGwei: stats.count > 0 ? Math.round((stats.totalBaseFee / stats.count) * 100) / 100 : null,
        avgPriorityFeeGwei: null,
      }));

    return {
      currentBaseFeeGwei: null, // filled from RPC in service
      avgBaseFee24h: null,
      avgPriorityFee24h: null,
      ourAvgGasCost: ourAvgGasCost !== null ? Math.round(ourAvgGasCost * 100) / 100 : null,
      gasSpentTotalUsd: Math.round(gasSpentTotalUsd * 100) / 100,
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
}

export interface AnalyticsRepository {
  getOverview(userId: string, query: BaseAnalyticsQuery): Promise<AnalyticsOverviewData>;
  getRoutes(userId: string, query: BaseAnalyticsQuery & { strategyId?: string; startDate?: string; endDate?: string; limit: number }): Promise<{ routes: RouteAnalytics[] }>;
  getCompetitors(query: AnalyticsCompetitorsQuery): Promise<{ competitors: CompetitorData[]; totalCompetitorTrades: number; ourWinRate: null }>;
  getGas(userId: string, query: { chainId?: number; period?: string }): Promise<GasAnalytics>;
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.repository.ts
git commit -m "feat(analytics): add analytics repository with SQL aggregation queries"
```

---

## Task 14.3: Backend — Analytics Service

**Files:**
- Create: `apps/api/src/modules/analytics/analytics.service.ts`

**Step 1: Write the service**

```typescript
// apps/api/src/modules/analytics/analytics.service.ts
import type { AnalyticsRepository } from './analytics.repository';
import type { AnalyticsGasQuery } from './analytics.schemas';

const ETH_GAS_PRICE_CACHE: Map<number, { value: number; timestamp: number }> = new Map();
const ETH_GAS_PRICE_CACHE_TTL_MS = 5000;

export class AnalyticsService {
  public constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly rpcUrl: string,
  ) {}

  public async getOverview(userId: string, query: { chainId?: number; period?: string }) {
    return this.analyticsRepository.getOverview(userId, query);
  }

  public async getRoutes(userId: string, query: { chainId?: number; period?: string; strategyId?: string; limit?: number }) {
    return this.analyticsRepository.getRoutes(userId, { ...query, limit: query.limit ?? 20 });
  }

  public async getCompetitors(query: { chainId?: number; limit?: number }) {
    return this.analyticsRepository.getCompetitors({ ...query, limit: query.limit ?? 20 });
  }

  public async getGas(userId: string, query: AnalyticsGasQuery) {
    const gas = await this.analyticsRepository.getGas(userId, query);
    // Fill currentBaseFeeGwei from RPC
    if (query.chainId) {
      gas.currentBaseFeeGwei = await this.fetchCurrentBaseFee(query.chainId);
    }
    return gas;
  }

  private async fetchCurrentBaseFee(chainId: number): Promise<number | null> {
    const cached = ETH_GAS_PRICE_CACHE.get(chainId);
    if (cached && Date.now() - cached.timestamp < ETH_GAS_PRICE_CACHE_TTL_MS) {
      return cached.value;
    }
    try {
      // Map chainId to RPC URL (simplified — in production use chain config)
      const rpcUrl = this.rpcUrl || 'https://eth.llamarpc.com';
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        }),
      });
      const data = (await response.json()) as { result: string };
      const gwei = Number(data.result) / 1e9;
      ETH_GAS_PRICE_CACHE.set(chainId, { value: gwei, timestamp: Date.now() });
      return gwei;
    } catch {
      return null;
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.service.ts
git commit -m "feat(analytics): add analytics service with RPC gas price fetch"
```

---

## Task 14.4: Backend — Analytics Routes

**Files:**
- Create: `apps/api/src/modules/analytics/analytics.routes.ts`

**Step 1: Write the routes**

```typescript
// apps/api/src/modules/analytics/analytics.routes.ts
import type { FastifyInstance } from 'fastify';

import { success } from '../../app';
import type { AnalyticsService } from './analytics.service';
import {
  analyticsOverviewQuerySchema,
  analyticsRoutesQuerySchema,
  analyticsCompetitorsQuerySchema,
  analyticsGasQuerySchema,
} from './analytics.schemas';

export const registerAnalyticsRoutes = (app: FastifyInstance, service: AnalyticsService) => {
  // GET /api/v1/analytics/overview
  app.get('/api/v1/analytics/overview', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsOverviewQuerySchema.parse(request.query);
    const data = await service.getOverview(request.principal!.userId, query);
    return success(reply, 200, data);
  });

  // GET /api/v1/analytics/routes
  app.get('/api/v1/analytics/routes', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsRoutesQuerySchema.parse(request.query);
    const data = await service.getRoutes(request.principal!.userId, query);
    return success(reply, 200, { routes: data.routes });
  });

  // GET /api/v1/analytics/competitors (trader+ tier required)
  app.get('/api/v1/analytics/competitors', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsCompetitorsQuerySchema.parse(request.query);
    // Tier check: requires trader or higher
    if (!['trader', 'executor', 'institutional'].includes(request.principal!.role)) {
      return reply.code(403).send({
        success: false,
        error: { code: 'TIER_LIMIT', message: 'Competitor analytics require Trader plan or higher.' },
      });
    }
    const data = await service.getCompetitors(query);
    return success(reply, 200, data);
  });

  // GET /api/v1/analytics/gas
  app.get('/api/v1/analytics/gas', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = analyticsGasQuerySchema.parse(request.query);
    const gas = await service.getGas(request.principal!.userId, query);
    return success(reply, 200, { gas });
  });
};
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.routes.ts
git commit -m "feat(analytics): add analytics REST endpoints"
```

---

## Task 14.5: Backend — App Wiring and RPC URL

**Files:**
- Modify: `apps/api/src/app.ts` — add analytics service instantiation and route registration
- Modify: `apps/api/src/config.ts` or env — add `ETH_RPC_URL` for gas price RPC

**Step 1: Wire analytics into app.ts**

In `BuildApiAppOptions`, add `analyticsRepository` and `analyticsService`. In `buildApiApp`, instantiate `AnalyticsService` and call `registerAnalyticsRoutes`.

```typescript
// In BuildApiAppOptions (add):
analyticsService?: AnalyticsService;

// In buildApiApp (add):
registerAnalyticsRoutes(app, options.analyticsService!);
```

**Step 2: Add ETH_RPC_URL env var**

Add `ETH_RPC_URL` to the env schema with default `https://eth.llamarpc.com`. Pass it to `AnalyticsService` constructor.

**Step 3: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/config.ts  # or wherever env is
git commit -m "feat(analytics): wire analytics service into app"
```

---

## Task 14.6: Backend — Analytics Route Tests

**Files:**
- Create: `apps/api/src/modules/analytics/analytics.routes.test.ts`

**Step 1: Write 4 route tests**

```typescript
// apps/api/src/modules/analytics/analytics.routes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('analytics routes', () => {
  // Setup: authenticated request helper, FakePrismaClient with trade + competitorActivity

  it('GET /analytics/overview returns profit/volume/successRate trends and daily breakdown', async () => {
    // Seed 3 trades across 2 dates
    // GET /analytics/overview?period=7d
    // Assert: profitTrend has cumulative values, volumeTrend has tradeCount, dailyBreakdown has all 4 fields
  });

  it('GET /analytics/routes aggregates trades by route path with correct stats', async () => {
    // Seed trades with different routePath values
    // GET /analytics/routes?period=7d&limit=10
    // Assert: routes sorted by totalProfitUsd desc, successCount correct, avg fields computed
  });

  it('GET /analytics/competitors aggregates competitor_activity by bot address, ourWinRate is null', async () => {
    // Seed 2 competitorActivity rows
    // GET /analytics/competitors?chainId=1
    // Assert: competitors[0].ourWinRate is null (Phase G), botAddress matches, tradeCount correct
  });

  it('GET /analytics/gas returns gasSpentTotalUsd from trades, currentBaseFeeGwei from RPC', async () => {
    // Seed 2 trades with gasCostUsd
    // Mock eth_gasPrice RPC
    // GET /analytics/gas?chainId=1&period=7d
    // Assert: gasSpentTotalUsd = sum of trade gas costs, currentBaseFeeGwei from mock, avgPriorityFee24h is null
  });
});
```

**Step 2: Add competitorActivity to FakePrismaClient**

In `test-harness.ts`, add `competitorActivity` to `FakePrismaClient`:
```typescript
competitorActivity: {
  findMany: async ({ where }: { where: Record<string, unknown> }) => [],
}
```

**Step 3: Run tests and verify they fail (red), then implement fixes**

Run: `pnpm exec vitest run src/modules/analytics/analytics.routes.test.ts --reporter=verbose`
Expected: FAIL (no implementation yet)

**Step 4: Verify all 4 pass after implementation**

Run same command. All 4 tests should PASS.

**Step 5: Commit**

```bash
git add apps/api/src/modules/analytics/analytics.routes.test.ts apps/api/src/test/test-harness.ts
git commit -m "test(analytics): add analytics route tests"
```

---

## Task 14.7: Frontend — Add Recharts and API Hooks

**Files:**
- Modify: `apps/web/package.json` — add `recharts`
- Create: `apps/web/src/features/analytics/api.ts`
- Create: `apps/web/src/features/analytics/config.ts`

**Step 1: Add recharts to package.json**

```bash
cd apps/web && pnpm add recharts
```

**Step 2: Write api.ts with all 4 analytics hooks**

```typescript
// apps/web/src/features/analytics/api.ts
import { useQuery } from '@tanstack/react-query';

const API_BASE = '/api/v1';

export interface AnalyticsOverviewData {
  profitTrend: Array<{ date: string; cumulativeProfitUsd: number }>;
  volumeTrend: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
  successRateTrend: Array<{ date: string; successRate: number }>;
  dailyBreakdown: Array<{
    date: string; grossProfitUsd: number; gasCostUsd: number;
    netProfitUsd: number; tradeCount: number;
  }>;
}

export interface RouteAnalytics {
  routeKey: string; dexes: string; executionCount: number; successCount: number;
  totalProfitUsd: number; avgProfitUsd: number; avgSlippagePct: number;
  avgExecutionTimeMs: number; lastExecutedAt: string;
}

export interface CompetitorData {
  botAddress: string; tradeCount: number; estimatedProfitUsd: number;
  avgGasPriceGwei: number; mostUsedRoutes: string[];
  firstSeenAt: string; lastSeenAt: string;
}

export interface GasAnalytics {
  currentBaseFeeGwei: number | null; avgBaseFee24h: null; avgPriorityFee24h: null;
  ourAvgGasCost: number | null; gasSpentTotalUsd: number | null;
  gasSavedByFlashbotsUsd: null; optimalExecutionHours: null;
  gasTrend: Array<{ hour: string; avgBaseFeeGwei: number | null; avgPriorityFeeGwei: number | null }>;
}

const buildParams = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, String(v)); });
  return p.toString();
};

export const useAnalyticsOverview = (params: { period?: string; chainId?: number }) =>
  useQuery<{ success: true; data: AnalyticsOverviewData }>({
    queryKey: ['analytics-overview', params],
    queryFn: () => fetch(`${API_BASE}/analytics/overview?${buildParams(params)}`).then((r) => r.json()),
  });

export const useAnalyticsRoutes = (params: { period?: string; chainId?: number; limit?: number }) =>
  useQuery<{ success: true; data: { routes: RouteAnalytics[] } }>({
    queryKey: ['analytics-routes', params],
    queryFn: () => fetch(`${API_BASE}/analytics/routes?${buildParams(params)}`).then((r) => r.json()),
  });

export const useAnalyticsCompetitors = (params: { chainId?: number; limit?: number }) =>
  useQuery<{ success: true; data: { competitors: CompetitorData[]; totalCompetitorTrades: number; ourWinRate: null } }>({
    queryKey: ['analytics-competitors', params],
    queryFn: () => fetch(`${API_BASE}/analytics/competitors?${buildParams(params)}`).then((r) => r.json()),
  });

export const useAnalyticsGas = (params: { period?: string; chainId?: number }) =>
  useQuery<{ success: true; data: { gas: GasAnalytics } }>({
    queryKey: ['analytics-gas', params],
    queryFn: () => fetch(`${API_BASE}/analytics/gas?${buildParams(params)}`).then((r) => r.json()),
  });
```

**Step 3: Write config.ts**

```typescript
// apps/web/src/features/analytics/config.ts
export const PERIOD_OPTIONS = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

export const CHAIN_OPTIONS = [
  { value: '', label: 'All Chains' },
  { value: '1', label: 'Ethereum' },
  { value: '42161', label: 'Arbitrum' },
  { value: '10', label: 'Optimism' },
  { value: '137', label: 'Polygon' },
];

export const formatGwei = (v: number | null) =>
  v === null ? '—' : `${v.toFixed(2)} gwei`;

export const formatUsd = (v: number | null) =>
  v === null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const NULL_TOOLTIP: Record<string, string> = {
  avgBaseFee24h: 'Available after execution is enabled',
  avgPriorityFee24h: 'Available after execution is enabled',
  gasSavedByFlashbotsUsd: 'Available after execution is enabled',
  optimalExecutionHours: 'Requires 7+ days of trade history',
  ourWinRate: 'Available after Phase G aggregation runs',
};
```

**Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/features/analytics/api.ts apps/web/src/features/analytics/config.ts
git commit -m "feat(analytics): add recharts, API hooks, and config"
```

---

## Task 14.8: Frontend — Chart Components

**Files:**
- Create: `apps/web/src/features/analytics/components/charts/ProfitChart.tsx`
- Create: `apps/web/src/features/analytics/components/charts/VolumeChart.tsx`
- Create: `apps/web/src/features/analytics/components/charts/SuccessRateChart.tsx`
- Create: `apps/web/src/features/analytics/components/charts/HourlyGasChart.tsx`

**Step 1: Write ProfitChart.tsx**

```tsx
// apps/web/src/features/analytics/components/charts/ProfitChart.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ProfitChartProps {
  data: Array<{ date: string; cumulativeProfitUsd: number }>;
}

export function ProfitChart({ data }: ProfitChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value: number) => [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Cumulative Profit']}
          labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        />
        <Area type="monotone" dataKey="cumulativeProfitUsd" stroke="#06b6d4" fill="url(#profitGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

**Step 2: Write VolumeChart.tsx**

```tsx
// apps/web/src/features/analytics/components/charts/VolumeChart.tsx
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface VolumeChartProps {
  data: Array<{ date: string; tradeCount: number; volumeUsd: number }>;
}

export function VolumeChart({ data }: VolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value: number, name: string) => [name === 'tradeCount' ? value : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, name === 'tradeCount' ? 'Trades' : 'Volume']}
        />
        <Legend formatter={(value) => value === 'tradeCount' ? 'Trade Count' : 'Volume (USD)'} />
        <Bar yAxisId="left" dataKey="tradeCount" fill="#06b6d4" name="tradeCount" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="volumeUsd" fill="#10b981" name="volumeUsd" radius={[4, 4, 0, 0]} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

**Step 3: Write SuccessRateChart.tsx**

```tsx
// apps/web/src/features/analytics/components/charts/SuccessRateChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface SuccessRateChartProps {
  data: Array<{ date: string; successRate: number }>;
}

export function SuccessRateChart({ data }: SuccessRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Success Rate']}
        />
        <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="successRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 4: Write HourlyGasChart.tsx**

```tsx
// apps/web/src/features/analytics/components/charts/HourlyGasChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface HourlyGasChartProps {
  data: Array<{ hour: string; avgBaseFeeGwei: number | null }>;
}

export function HourlyGasChart({ data }: HourlyGasChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    hourLabel: new Date(d.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="hourLabel" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={2} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `${v}gwei`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: 12, color: '#e5e7eb' }}
          formatter={(value: number, name: string) => [`${value.toFixed(2)} gwei`, name === 'avgBaseFeeGwei' ? 'Base Fee' : 'Priority Fee']}
        />
        <Legend formatter={(value) => value === 'avgBaseFeeGwei' ? 'Base Fee' : 'Priority Fee'} />
        <Line type="monotone" dataKey="avgBaseFeeGwei" stroke="#9ca3af" name="avgBaseFeeGwei" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 5: Create charts index**

```tsx
// apps/web/src/features/analytics/components/charts/index.ts
export { ProfitChart } from './ProfitChart';
export { VolumeChart } from './VolumeChart';
export { SuccessRateChart } from './SuccessRateChart';
export { HourlyGasChart } from './HourlyGasChart';
```

**Step 6: Commit**

```bash
git add apps/web/src/features/analytics/components/charts/
git commit -m "feat(analytics): add Recharts chart components"
```

---

## Task 14.9: Frontend — Tab Components

**Files:**
- Create: `apps/web/src/features/analytics/pages/tabs/OverviewTab.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/RoutesTab.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/CompetitorsTab.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/GasTab.tsx`

**Step 1: OverviewTab.tsx**

Uses `useAnalyticsOverview`. Renders `ProfitChart`, `VolumeChart`, `SuccessRateChart` in a 2-column grid (profit+volume top, success rate bottom). Below charts: `dailyBreakdown` table with columns date/gross profit/gas/net profit/trade count.

```tsx
// apps/web/src/features/analytics/pages/tabs/OverviewTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsOverview } from '../../api';
import { ProfitChart, VolumeChart, SuccessRateChart } from '../../components/charts';

interface OverviewTabProps {
  period: string;
  chainId?: number;
}

export function OverviewTab({ period, chainId }: OverviewTabProps) {
  const { data, isLoading, isError } = useAnalyticsOverview({ period, chainId });

  if (isLoading) return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  if (isError || !data?.data) return <Card variant="error" title="Failed to load analytics" subtitle="Retry to fetch data." />;

  const { profitTrend, volumeTrend, successRateTrend, dailyBreakdown } = data.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profit Trend" subtitle="Cumulative net profit over time">
          <ProfitChart data={profitTrend} />
        </Card>
        <Card title="Volume" subtitle="Trade count and volume per day">
          <VolumeChart data={volumeTrend} />
        </Card>
      </div>
      <Card title="Success Rate" subtitle="Percentage of successful trades over time">
        <SuccessRateChart data={successRateTrend} />
      </Card>
      <Card title="Daily Breakdown" subtitle="Per-day profit and gas breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-fx-text-muted">
                <th className="pb-3 text-left">Date</th>
                <th className="pb-3 text-right">Gross Profit</th>
                <th className="pb-3 text-right">Gas Cost</th>
                <th className="pb-3 text-right">Net Profit</th>
                <th className="pb-3 text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.map((row) => (
                <tr key={row.date} className="border-t border-fx-border-subtle">
                  <td className="py-3 font-mono text-xs">{row.date}</td>
                  <td className="py-3 text-right font-mono">${row.grossProfitUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono text-fx-text-secondary">${row.gasCostUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono font-medium">${row.netProfitUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono">{row.tradeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

**Step 2: RoutesTab.tsx**

Uses `useAnalyticsRoutes`. Table columns: Route, Executions, Success Rate, Total Profit, Avg Profit, Avg Slippage, Avg Execution Time, Last Executed. Sort by Total Profit desc. Empty state if no routes.

```tsx
// apps/web/src/features/analytics/pages/tabs/RoutesTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsRoutes } from '../../api';
import { formatRoutePath } from '../../config';

interface RoutesTabProps {
  period: string;
  chainId?: number;
}

export function RoutesTab({ period, chainId }: RoutesTabProps) {
  const { data, isLoading, isError } = useAnalyticsRoutes({ period, chainId, limit: 20 });

  if (isLoading) return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  if (isError || !data?.data) return <Card variant="error" title="Failed to load route analytics" subtitle="Retry to fetch data." />;

  const { routes } = data.data;

  if (routes.length === 0) {
    return <Card title="No route data" subtitle="Route analytics will appear once you have executed trades." />;
  }

  return (
    <Card title="Route Performance" subtitle="Most profitable routes by total net profit.">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-fx-text-muted">
              <th className="pb-3 text-left">Route</th>
              <th className="pb-3 text-right">Executions</th>
              <th className="pb-3 text-right">Success Rate</th>
              <th className="pb-3 text-right">Total Profit</th>
              <th className="pb-3 text-right">Avg Profit</th>
              <th className="pb-3 text-right">Avg Slippage</th>
              <th className="pb-3 text-right">Avg Time</th>
              <th className="pb-3 text-right">Last Executed</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.routeKey} className="border-t border-fx-border-subtle hover:bg-fx-surface/50">
                <td className="py-3 font-mono text-xs">{formatRoutePath(route.routeKey.split('→').map((t) => ({ tokenIn: t.split('→')[0], tokenOut: t.split('→')[1] })) as any)}</td>
                <td className="py-3 text-right font-mono">{route.executionCount}</td>
                <td className="py-3 text-right font-mono">{((route.successCount / route.executionCount) * 100).toFixed(1)}%</td>
                <td className="py-3 text-right font-mono font-medium">${route.totalProfitUsd.toFixed(2)}</td>
                <td className="py-3 text-right font-mono">${route.avgProfitUsd.toFixed(2)}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{route.avgSlippagePct.toFixed(4)}%</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{route.avgExecutionTimeMs}ms</td>
                <td className="py-3 text-right font-mono text-xs text-fx-text-secondary">{new Date(route.lastExecutedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

**Step 3: CompetitorsTab.tsx**

Uses `useAnalyticsCompetitors`. Table columns: Bot Address (with explorer link), Trade Count, Est. Profit, Avg Gas, Most Used Routes, First Seen, Last Seen, Our Win Rate. `ourWinRate` null → show `--` with tooltip.

```tsx
// apps/web/src/features/analytics/pages/tabs/CompetitorsTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsCompetitors } from '../../api';
import { formatUsd, NULL_TOOLTIP } from '../../config';

interface CompetitorsTabProps {
  chainId?: number;
}

export function CompetitorsTab({ chainId }: CompetitorsTabProps) {
  const { data, isLoading, isError } = useAnalyticsCompetitors({ chainId, limit: 20 });

  if (isLoading) return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  if (isError || !data?.data) return <Card variant="error" title="Failed to load competitor data" subtitle="Retry to fetch data." />;

  const { competitors, totalCompetitorTrades, ourWinRate } = data.data;

  if (competitors.length === 0) {
    return <Card title="No competitor activity" subtitle="Competitor bot activity will appear once the network scanner is running." />;
  }

  const explorerBase = (addr: string) => `https://etherscan.io/address/${addr}`;

  return (
    <Card title="Competitor Activity" subtitle={`${totalCompetitorTrades} total competitor transactions detected.`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-fx-text-muted">
              <th className="pb-3 text-left">Bot Address</th>
              <th className="pb-3 text-right">Trades</th>
              <th className="pb-3 text-right">Est. Profit</th>
              <th className="pb-3 text-right">Avg Gas</th>
              <th className="pb-3 text-left">Top Routes</th>
              <th className="pb-3 text-left">First Seen</th>
              <th className="pb-3 text-left">Last Seen</th>
              <th className="pb-3 text-right">Our Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp) => (
              <tr key={comp.botAddress} className="border-t border-fx-border-subtle hover:bg-fx-surface/50">
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">{comp.botAddress.substring(0, 10)}...</span>
                    <a href={explorerBase(comp.botAddress)} target="_blank" rel="noopener noreferrer"
                       className="text-cyan-400 hover:text-cyan-200" aria-label="View on Etherscan">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                </td>
                <td className="py-3 text-right font-mono">{comp.tradeCount}</td>
                <td className="py-3 text-right font-mono">{formatUsd(comp.estimatedProfitUsd)}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{comp.avgGasPriceGwei.toFixed(2)} gwei</td>
                <td className="py-3 text-xs text-fx-text-secondary">{comp.mostUsedRoutes.slice(0, 2).join(', ')}</td>
                <td className="py-3 font-mono text-xs text-fx-text-secondary">{new Date(comp.firstSeenAt).toLocaleDateString()}</td>
                <td className="py-3 font-mono text-xs text-fx-text-secondary">{new Date(comp.lastSeenAt).toLocaleDateString()}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary" title={NULL_TOOLTIP.ourWinRate}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

**Step 4: GasTab.tsx**

Uses `useAnalyticsGas`. Shows 3 `StatCard` components (Total Gas Spent, Avg Gas Cost, Current Base Fee). Shows `HourlyGasChart` below. Null fields show `--` with tooltip.

```tsx
// apps/web/src/features/analytics/pages/tabs/GasTab.tsx
import { Card } from '@flashroute/ui';
import { StatCard } from '@flashroute/ui';
import { useAnalyticsGas } from '../../api';
import { HourlyGasChart } from '../../components/charts';
import { formatUsd, formatGwei, NULL_TOOLTIP } from '../../config';

interface GasTabProps {
  period: string;
  chainId?: number;
}

export function GasTab({ period, chainId }: GasTabProps) {
  const { data, isLoading, isError } = useAnalyticsGas({ period, chainId });

  if (isLoading) return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  if (isError || !data?.data) return <Card variant="error" title="Failed to load gas analytics" subtitle="Retry to fetch data." />;

  const { gas } = data.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          title="Total Gas Spent"
          value={formatUsd(gas.gasSpentTotalUsd)}
          subtitle={`Across all trades in ${period}`}
        />
        <StatCard
          title="Avg Gas Cost / Trade"
          value={formatUsd(gas.ourAvgGasCost)}
          subtitle="From your trade history"
        />
        <StatCard
          title="Current Base Fee"
          value={formatGwei(gas.currentBaseFeeGwei)}
          subtitle={gas.avgBaseFee24h === null ? NULL_TOOLTIP.avgBaseFee24h : `${gas.avgBaseFee24h} avg (24h)`}
        />
      </div>
      <Card title="Gas Price Trend" subtitle="Hourly average gas costs from your trades (last 24h).">
        {gas.gasTrend.length > 0 ? (
          <HourlyGasChart data={gas.gasTrend} />
        ) : (
          <p className="text-sm text-fx-text-secondary py-8 text-center">No gas data available yet.</p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Flashbots Savings" subtitle="Gas saved via Flashbots RPC">
          <p className="text-2xl font-mono font-bold text-fx-text-secondary" title={NULL_TOOLTIP.gasSavedByFlashbotsUsd}>—</p>
          <p className="text-xs text-fx-text-muted mt-1">{NULL_TOOLTIP.gasSavedByFlashbotsUsd}</p>
        </Card>
        <Card title="Optimal Execution Windows" subtitle="Most profitable hours to execute">
          <p className="text-2xl font-mono font-bold text-fx-text-secondary" title={NULL_TOOLTIP.optimalExecutionHours}>—</p>
          <p className="text-xs text-fx-text-muted mt-1">{NULL_TOOLTIP.optimalExecutionHours}</p>
        </Card>
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add apps/web/src/features/analytics/pages/tabs/
git commit -m "feat(analytics): add tab components (Overview, Routes, Competitors, Gas)"
```

---

## Task 14.10: Frontend — AnalyticsPage Shell and Router

**Files:**
- Create: `apps/web/src/features/analytics/pages/AnalyticsPage.tsx`
- Create: `apps/web/src/features/analytics/pages/AnalyticsPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx` — add `/analytics` route

**Step 1: Write AnalyticsPage.tsx**

```tsx
// apps/web/src/features/analytics/pages/AnalyticsPage.tsx
import { useSearchParams } from 'react-router-dom';
import { Card } from '@flashroute/ui';

import { PERIOD_OPTIONS, CHAIN_OPTIONS } from '../config';
import { OverviewTab } from './tabs/OverviewTab';
import { RoutesTab } from './tabs/RoutesTab';
import { CompetitorsTab } from './tabs/CompetitorsTab';
import { GasTab } from './tabs/GasTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'routes', label: 'Routes' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'gas', label: 'Gas' },
] as const;

type Tab = typeof TABS[number]['value'];

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get('tab') ?? 'overview') as Tab;
  const period = searchParams.get('period') ?? '7d';
  const chainId = searchParams.get('chainId') ? Number(searchParams.get('chainId')) : undefined;

  const setTab = (t: Tab) => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; });
  const setPeriod = (p: string) => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('period', p); n.set('page', '1'); return n; });
  const setChainId = (c: string) => setSearchParams((prev) => { const n = new URLSearchParams(prev); c ? n.set('chainId', c) : n.delete('chainId'); n.set('page', '1'); return n; });

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Analytics</p>
          <h1 className="text-3xl font-semibold">Analytics</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Platform-wide performance metrics and route analytics.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm text-fx-text-primary outline-none"
          >
            {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={searchParams.get('chainId') ?? ''}
            onChange={(e) => setChainId(e.target.value)}
            className="h-10 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm text-fx-text-primary outline-none"
          >
            {CHAIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </header>

      <div className="flex gap-1 border-b border-fx-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-cyan-400 text-cyan-400'
                : 'text-fx-text-muted hover:text-fx-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {tab === 'overview' && <OverviewTab period={period} chainId={chainId} />}
        {tab === 'routes' && <RoutesTab period={period} chainId={chainId} />}
        {tab === 'competitors' && <CompetitorsTab chainId={chainId} />}
        {tab === 'gas' && <GasTab period={period} chainId={chainId} />}
      </div>
    </div>
  );
}
```

**Step 2: Wire into router**

```tsx
// In apps/web/src/app/router.tsx
<Route path="/analytics" element={<AnalyticsPage />} />
```

**Step 3: Commit**

```bash
git add apps/web/src/features/analytics/pages/AnalyticsPage.tsx apps/web/src/app/router.tsx
git commit -m "feat(analytics): add AnalyticsPage shell with tab routing"
```

---

## Task 14.11: Frontend — Tests

**Files:**
- Create: `apps/web/src/features/analytics/pages/tabs/OverviewTab.test.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/RoutesTab.test.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/CompetitorsTab.test.tsx`
- Create: `apps/web/src/features/analytics/pages/tabs/GasTab.test.tsx`

**Step 1: OverviewTab.test.tsx (2 tests)**

```tsx
// apps/web/src/features/analytics/pages/tabs/OverviewTab.test.tsx
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { OverviewTab } from './OverviewTab';
import { renderWithProviders } from '@/test/renderWithProviders';

const overviewPayload = {
  success: true,
  data: {
    profitTrend: [{ date: '2026-03-14', cumulativeProfitUsd: 1234.56 }],
    volumeTrend: [{ date: '2026-03-14', tradeCount: 28, volumeUsd: 45000 }],
    successRateTrend: [{ date: '2026-03-14', successRate: 87.5 }],
    dailyBreakdown: [{ date: '2026-03-14', grossProfitUsd: 145.67, gasCostUsd: 12.34, netProfitUsd: 133.33, tradeCount: 28 }],
  },
};

describe('OverviewTab', () => {
  it('renders charts after data loads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(overviewPayload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    renderWithProviders(<Route path="/" element={<OverviewTab period="7d" />} />, { route: '/' });
    expect(await screen.findByText(/profit trend/i)).toBeInTheDocument();
    expect(await screen.findByText(/volume/i)).toBeInTheDocument();
    expect(await screen.findByText(/success rate/i)).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}) as any);
    const { container } = renderWithProviders(<Route path="/" element={<OverviewTab period="7d" />} />, { route: '/' });
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
```

**Step 2: RoutesTab.test.tsx (2 tests)**

```tsx
// apps/web/src/features/analytics/pages/tabs/RoutesTab.test.tsx
// Test: renders route table with data, shows empty state
```

**Step 3: CompetitorsTab.test.tsx (1 test)**

```tsx
// apps/web/src/features/analytics/pages/tabs/CompetitorsTab.test.tsx
// Test: renders competitor table with explorer links, ourWinRate shows "--"
```

**Step 4: GasTab.test.tsx (2 tests)**

```tsx
// apps/web/src/features/analytics/pages/tabs/GasTab.test.tsx
// Test 1: renders stat cards and HourlyGasChart
// Test 2: null fields show "--" with tooltip
```

**Step 5: Run all tests, fix failures**

Run: `pnpm exec vitest run src/features/analytics/ --reporter=verbose`

**Step 6: Commit**

```bash
git add apps/web/src/features/analytics/pages/tabs/*.test.tsx
git commit -m "test(analytics): add tab component tests"
```

---

## Task 14.12: Final Verification

**Step 1: Typecheck**

```bash
pnpm --filter @flashroute/api typecheck
pnpm --filter @flashroute/web typecheck
```

Expected: Both green.

**Step 2: All tests**

```bash
pnpm --filter @flashroute/api test
pnpm exec vitest run src/features/analytics/ --reporter=verbose
```

Expected: API 40+ tests pass, 7 analytics frontend tests pass.

**Step 3: Lint (if applicable)**

Check for any lint scripts and run them.

---

## File Summary

### Backend (new files)
- `apps/api/src/modules/analytics/analytics.types.ts`
- `apps/api/src/modules/analytics/analytics.schemas.ts`
- `apps/api/src/modules/analytics/analytics.repository.ts`
- `apps/api/src/modules/analytics/analytics.service.ts`
- `apps/api/src/modules/analytics/analytics.routes.ts`
- `apps/api/src/modules/analytics/analytics.routes.test.ts`

### Frontend (new files)
- `apps/web/src/features/analytics/api.ts`
- `apps/web/src/features/analytics/config.ts`
- `apps/web/src/features/analytics/components/charts/ProfitChart.tsx`
- `apps/web/src/features/analytics/components/charts/VolumeChart.tsx`
- `apps/web/src/features/analytics/components/charts/SuccessRateChart.tsx`
- `apps/web/src/features/analytics/components/charts/HourlyGasChart.tsx`
- `apps/web/src/features/analytics/components/charts/index.ts`
- `apps/web/src/features/analytics/pages/AnalyticsPage.tsx`
- `apps/web/src/features/analytics/pages/AnalyticsPage.test.tsx`
- `apps/web/src/features/analytics/pages/tabs/OverviewTab.tsx`
- `apps/web/src/features/analytics/pages/tabs/OverviewTab.test.tsx`
- `apps/web/src/features/analytics/pages/tabs/RoutesTab.tsx`
- `apps/web/src/features/analytics/pages/tabs/RoutesTab.test.tsx`
- `apps/web/src/features/analytics/pages/tabs/CompetitorsTab.tsx`
- `apps/web/src/features/analytics/pages/tabs/CompetitorsTab.test.tsx`
- `apps/web/src/features/analytics/pages/tabs/GasTab.tsx`
- `apps/web/src/features/analytics/pages/tabs/GasTab.test.tsx`

### Modified files
- `apps/api/src/app.ts` — wire analytics service
- `apps/api/src/config.ts` — add ETH_RPC_URL
- `apps/api/src/test/test-harness.ts` — add competitorActivity to FakePrismaClient
- `apps/web/package.json` — add recharts
- `apps/web/src/app/router.tsx` — add analytics route
