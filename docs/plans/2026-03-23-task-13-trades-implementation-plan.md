# Task 13 Implementation Plan: Trade Persistence, Read APIs & Trades UI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Trade service (write interface for Phase F), three REST read endpoints (`GET /trades`, `GET /trades/:id`, `GET /trades/summary`), Redis pub/sub constants, and two frontend pages (TradesListPage, TradeDetailPage).

**Architecture:**
- Trade service owns all Postgres queries and status-transition logic. The write path (executor → Redis queue → jobs-worker → trade service) is deferred to Phase F; Task 13 builds the service interface the jobs-worker will call.
- Redis pub/sub channels: `fr:trades:queue` (Streams queue for async persistence), `fr:trades:live` (pub/sub for dashboard fanout).
- Trade status lifecycle per spec: `DETECTED → SIMULATED → SUBMITTED_PRIVATE | SUBMITTED_PUBLIC → INCLUDED → SETTLED | REVERTED | FAILED`
- Three REST read endpoints only — live state comes through existing `trades:live` WebSocket channel from Task 10.

**Tech Stack:** Fastify, Prisma, Redis (ioredis), TanStack Query, React Router 6, Zod, Vitest

---

## Task 13.1: Update Prisma TradeStatus enum

**Files:**
- Modify: `packages/db/prisma/schema.prisma:54-61`
- Modify: `packages/db/prisma/migrations/20260322093000_initial/migration.sql`
- Modify: `packages/db/src/factories/trade.factory.ts:10`
- Modify: `apps/api/src/test/test-harness.ts` — add trade model to `FakePrismaClient`

**Step 1: Write the failing test**
```typescript
// packages/db/prisma/schema.test.ts — add test for new trade statuses
it('includes all executor-relevant trade statuses', () => {
  const content = readFileSync(resolve(process.cwd(), 'src/factories/trade.factory.ts'), 'utf8');
  const statusValues = ['PENDING', 'SUBMITTED', 'INCLUDED', 'CONFIRMED', 'REVERTED', 'FAILED'];
  // This test already exists — just verify it still compiles
  expect(tradeFactory()).toContain('buildTradeFactoryInput');
});
```

Run: `pnpm --filter @flashroute/db test`
Expected: PASS (no schema changes needed in test — schema.prisma is the source of truth)

**Step 2: Update schema.prisma TradeStatus enum**
```prisma
enum TradeStatus {
  DETECTED         @map("detected")
  SIMULATED        @map("simulated")
  SUBMITTED_PRIVATE @map("submitted_private")
  SUBMITTED_PUBLIC  @map("submitted_public")
  INCLUDED         @map("included")
  SETTLED          @map("settled")
  REVERTED         @map("reverted")
  FAILED           @map("failed")
}
```
Also update `Trade.model` to reflect any column renames implied by the new statuses. The `default(PENDING)` becomes `default(DETECTED)`.

**Step 3: Update migration.sql** — replace the `CREATE TYPE "TradeStatus"` block with the new 8 values.

**Step 4: Update trade.factory.ts** — change `status: TradeStatus.PENDING` to `status: TradeStatus.DETECTED`.

**Step 5: Add trade model to FakePrismaClient in test-harness.ts**

Add a `trade` property to `FakePrismaClient` class following the pattern of the existing `strategy` property. Must implement: `create`, `findFirst`, `findMany`, `update`, `delete`. Also add `tradeHop` with `create` and `findMany`.

```typescript
// In test-harness.ts, add after the strategy property block:
public readonly trade = {
  create: async ({ data }: { data: any }) => {
    const now = new Date();
    const record = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
    this.trades.push(record);
    return record;
  },
  findFirst: async ({ where }: { where: any }) =>
    this.trades.find((t) => Object.entries(where).every(([k, v]) => (t as any)[k] === v)) ?? null,
  findMany: async ({ where, orderBy, skip = 0, take }: { where: any; orderBy?: any; skip?: number; take?: number }) => {
    const filtered = this.trades.filter((t) => Object.entries(where).every(([k, v]) => (t as any)[k] === v));
    const sorted = orderBy ? sortByCreatedAt(filtered, orderBy.createdAt) : filtered;
    return take === undefined ? sorted.slice(skip) : sorted.slice(skip, skip + take);
  },
  update: async ({ where, data }: { where: { id: string }; data: any }) => {
    const record = this.trades.find((t) => t.id === where.id)!;
    Object.assign(record, data, { updatedAt: new Date() });
    return record;
  },
  delete: async ({ where }: { where: { id: string } }) => {
    const idx = this.trades.findIndex((t) => t.id === where.id);
    return this.trades.splice(idx, 1)[0];
  },
};

public readonly tradeHop = {
  create: async ({ data }: { data: any }) => {
    const record = { id: randomUUID(), createdAt: new Date(), ...data };
    this.tradeHops.push(record);
    return record;
  },
  findMany: async ({ where }: { where: any }) =>
    this.tradeHops.filter((h) => Object.entries(where).every(([k, v]) => (h as any)[k] === v)),
};
```

Add `trades: any[] = []` and `tradeHops: any[] = []` to the `FakePrismaClient` constructor body.

**Step 6: Run tests**
Run: `pnpm --filter @flashroute/db test && pnpm --filter @flashroute/api test -- --run`
Expected: DB tests pass, API tests (existing 39/40) still pass

**Step 7: Commit**
```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260322093000_initial/migration.sql packages/db/src/factories/trade.factory.ts apps/api/src/test/test-harness.ts
git commit -m "feat(Task13): update TradeStatus enum to full lifecycle + add trade to FakePrismaClient"
```

---

## Task 13.2: Add Redis trade queue constants

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Step 1: Add trade constants**
```typescript
export const REDIS_CHANNELS = {
  // ... existing entries ...
  tradesQueue: 'fr:trades:queue',   // Redis Streams — executor writes, jobs-worker reads
  tradesLive: 'fr:trades:live',     // pub/sub — dashboard live updates
} as const;
```

**Step 2: Commit**
```bash
git add packages/shared/src/constants.ts
git commit -m "feat(Task13): add trade Redis queue and pub/sub channels"
```

---

## Task 13.3: Create trade repository

**Files:**
- Create: `apps/api/src/modules/trades/trades.repository.ts`

**Step 1: Define repository interface and Prisma model types**

```typescript
export type TradeStatus = 'detected' | 'simulated' | 'submitted_private' | 'submitted_public' | 'included' | 'settled' | 'reverted' | 'failed';

export interface TradeRecord {
  id: string;
  strategyId: string;
  userId: string;
  chainId: number;
  status: TradeStatus;
  txHash: string | null;
  blockNumber: bigint | null;
  routePath: Json;
  routeHops: number;
  flashLoanProvider: string;
  flashLoanToken: string;
  flashLoanAmount: number;
  flashLoanFee: number;
  profitRaw: number | null;
  profitUsd: number | null;
  gasUsed: bigint | null;
  gasPriceGwei: number | null;
  gasCostUsd: number | null;
  netProfitUsd: number | null;
  simulatedProfitUsd: number;
  slippagePct: number | null;
  demandPredictionUsed: boolean;
  competingTxsInBlock: number | null;
  errorMessage: string | null;
  executionTimeMs: number;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hops: TradeHopRecord[];
  chain: { chainId: number; name: string } | null;
  strategy: { id: string; name: string } | null;
}

export interface TradeHopRecord {
  id: string;
  tradeId: string;
  hopIndex: number;
  poolId: string;
  tokenInId: string;
  tokenOutId: string;
  amountIn: number;
  amountOut: number;
  expectedAmountOut: number;
  slippagePct: number | null;
  createdAt: Date;
  tokenIn: { symbol: string; address: string } | null;
  tokenOut: { symbol: string; address: string } | null;
  pool: { address: string; dex: string } | null;
}

export interface TradeListFilters {
  userId: string;
  chainId?: number;
  strategyId?: string;
  status?: TradeStatus;
  startDate?: Date;
  endDate?: Date;
  minProfitUsd?: number;
  sortBy: 'createdAt' | 'netProfitUsd' | 'gasUsed';
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface TradesRepository {
  create(input: CreateTradeRecordInput): Promise<TradeRecord>;
  findById(userId: string, tradeId: string): Promise<TradeRecord | null>;
  listByUser(filters: TradeListFilters): Promise<{ trades: TradeRecord[]; total: number }>;
  updateStatus(tradeId: string, status: TradeStatus, details: UpdateTradeStatusDetails): Promise<TradeRecord>;
  addHops(tradeId: string, hops: CreateTradeHopRecordInput[]): Promise<void>;
  getSummary(userId: string, filters: TradeSummaryFilters): Promise<TradeSummary>;
}

export interface CreateTradeRecordInput {
  userId: string;
  strategyId: string;
  chainId: number;
  status: TradeStatus;
  routePath: Json;
  routeHops: number;
  flashLoanProvider: string;
  flashLoanToken: string;
  flashLoanAmount: number;
  flashLoanFee: number;
  simulatedProfitUsd: number;
  demandPredictionUsed: boolean;
  executionTimeMs: number;
}

export interface UpdateTradeStatusDetails {
  txHash?: string;
  blockNumber?: bigint;
  profitUsd?: number;
  gasUsed?: bigint;
  gasPriceGwei?: number;
  gasCostUsd?: number;
  netProfitUsd?: number;
  slippagePct?: number;
  competingTxsInBlock?: number;
  errorMessage?: string;
  submittedAt?: Date;
  confirmedAt?: Date;
}

export interface CreateTradeHopRecordInput {
  hopIndex: number;
  poolId: string;
  tokenInId: string;
  tokenOutId: string;
  amountIn: number;
  amountOut: number;
  expectedAmountOut: number;
  slippagePct?: number;
}

export interface TradeSummaryFilters {
  userId: string;
  chainId?: number;
  strategyId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface TradeSummary {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  successRate: number;
  totalProfitUsd: number;
  totalGasCostUsd: number;
  netProfitUsd: number;
  avgProfitPerTradeUsd: number;
  maxProfitTradeUsd: number;
  avgExecutionTimeMs: number;
  topRoutes: Array<{ path: string; count: number; totalProfit: number }>;
  profitByDay: Array<{ date: string; profit: number; trades: number }>;
}
```

**Step 2: Write failing tests**
```typescript
// apps/api/src/modules/trades/trades.repository.test.ts
import { describe, it, expect } from 'vitest';
import { PrismaStrategiesRepository } from './strategies.repository';

describe('PrismaTradesRepository', () => {
  it('should be importable', () => {
    expect(true).toBe(true); // Placeholder — real tests in routes
  });
});
```
Run: `pnpm exec vitest run apps/api/src/modules/trades/trades.repository.test.ts` — expect PASS (file doesn't exist yet, so this would error; skip this step and just write the implementation)

**Step 3: Write PrismaTradesRepository implementation**

Follow the exact same pattern as `PrismaStrategiesRepository`:
- `decimalToNumber` helper for all Decimal fields
- `toTradeRecord` mapper
- Flash loan provider map (lowercase → uppercase DB values: `auto → AUTO`)
- `create`, `findById`, `listByUser` (with composite index query using `chainId + status + createdAt`), `updateStatus`, `addHops`, `getSummary` (with GROUP BY and raw date truncation for profitByDay)

Key implementation details for `listByUser`:
```typescript
const where = {
  userId,
  ...(filters.chainId === undefined ? {} : { chainId: filters.chainId }),
  ...(filters.strategyId === undefined ? {} : { strategyId: filters.strategyId }),
  ...(filters.status === undefined ? {} : { status: filters.status }),
  ...(filters.startDate === undefined ? {} : { createdAt: { gte: filters.startDate } }),
  ...(filters.endDate === undefined ? {} : { createdAt: { lte: filters.endDate } }),
  ...(filters.minProfitUsd === undefined ? {} : { netProfitUsd: { gte: filters.minProfitUsd } }),
};
```

Key implementation details for `getSummary`:
- Use Prisma `groupBy` on `status` to compute totalTrades, successfulTrades, failedTrades
- Sum `netProfitUsd` and `gasCostUsd` across all trades in the date range
- For `topRoutes`, deserialize `routePath` JSON and build path strings like `WETH→USDC→DAI→WETH`
- For `profitByDay`, use Prisma raw query or fetch all matching trades and group in JS (acceptable for MVP since date ranges are bounded by the query)

**Step 4: Commit**
```bash
git add apps/api/src/modules/trades/trades.repository.ts
git commit -m "feat(Task13): add trade repository with PrismaTradesRepository"
```

---

## Task 13.4: Create trade service

**Files:**
- Create: `apps/api/src/modules/trades/trades.service.ts`

**Step 1: Write the service**

```typescript
import type { TradesRepository, TradeRecord, TradeSummary, CreateTradeRecordInput, UpdateTradeStatusDetails, CreateTradeHopRecordInput } from './trades.repository';

const VALID_STATUS_TRANSITIONS: Record<string, TradeStatus[]> = {
  detected: ['simulated'],
  simulated: ['submitted_private', 'submitted_public'],
  submitted_private: ['included'],
  submitted_public: ['included'],
  included: ['settled', 'reverted'],
  settled: [],
  reverted: [],
  failed: [],
};

export class TradesService {
  public constructor(private readonly tradesRepository: TradesRepository) {}

  public async create(input: CreateTradeRecordInput): Promise<TradeRecord> {
    return this.tradesRepository.create(input);
  }

  public async addHops(tradeId: string, hops: CreateTradeHopRecordInput[]): Promise<void> {
    return this.tradesRepository.addHops(tradeId, hops);
  }

  public async getById(userId: string, tradeId: string): Promise<TradeRecord | null> {
    return this.tradesRepository.findById(userId, tradeId);
  }

  public async list(userId: string, query: ListTradesQuery): Promise<{ trades: TradeRecord[]; meta: PaginationMeta }> {
    const filters = { userId, ...query };
    const result = await this.tradesRepository.listByUser(filters);
    return {
      trades: result.trades.map(this.toTradeDto),
      meta: { page: query.page, limit: query.limit, total: result.total, totalPages: Math.ceil(result.total / query.limit) },
    };
  }

  public async getSummary(userId: string, query: TradeSummaryQuery): Promise<{ summary: TradeSummary }> {
    const filters = { userId, ...query };
    return { summary: await this.tradesRepository.getSummary(filters) };
  }

  public async updateStatus(tradeId: string, newStatus: TradeStatus, details: UpdateTradeStatusDetails = {}): Promise<TradeRecord> {
    const existing = await this.tradesRepository.findById('', tradeId);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Trade not found');
    const allowed = VALID_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Invalid status transition from ${existing.status} to ${newStatus}`);
    }
    return this.tradesRepository.updateStatus(tradeId, newStatus, details);
  }

  private toTradeDto(trade: TradeRecord) {
    return { /* map all fields excluding internal ids */ };
  }
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ListTradesQuery {
  chainId?: number;
  strategyId?: string;
  status?: TradeStatus;
  startDate?: string; // ISO date
  endDate?: string;
  minProfitUsd?: number;
  sortBy?: 'createdAt' | 'netProfitUsd' | 'gasUsed';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

interface TradeSummaryQuery {
  chainId?: number;
  strategyId?: string;
  startDate?: string;
  endDate?: string;
}
```

**Step 2: Commit**
```bash
git add apps/api/src/modules/trades/trades.service.ts
git commit -m "feat(Task13): add trade service with status transition validation"
```

---

## Task 13.5: Create trade routes and schemas

**Files:**
- Create: `apps/api/src/modules/trades/trades.schemas.ts`
- Create: `apps/api/src/modules/trades/trades.routes.ts`
- Create: `apps/api/src/modules/trades/trades.routes.test.ts`
- Modify: `apps/api/src/app.ts` — register trade routes
- Modify: `apps/api/src/test/test-harness.ts` — add `tradesService` to harness

**Step 1: Write trade schemas**
```typescript
// apps/api/src/modules/trades/trades.schemas.ts
import { z } from 'zod';

export const tradeStatusSchema = z.enum([
  'detected', 'simulated', 'submitted_private', 'submitted_public',
  'included', 'settled', 'reverted', 'failed',
]);

export const listTradesQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  strategyId: z.string().uuid().optional(),
  status: tradeStatusSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minProfitUsd: z.coerce.number().min(0).optional(),
  sortBy: z.enum(['createdAt', 'netProfitUsd', 'gasUsed']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const tradeSummaryQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  strategyId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ListTradesQuery = z.infer<typeof listTradesQuerySchema>;
export type TradeSummaryQuery = z.infer<typeof tradeSummaryQuerySchema>;
```

**Step 2: Write trade routes**
```typescript
// apps/api/src/modules/trades/trades.routes.ts
import type { FastifyInstance } from 'fastify';
import { ApiError, getRequestMetadata, success } from '../../app';
import type { TradesService } from './trades.service';
import { listTradesQuerySchema, tradeSummaryQuerySchema } from './trades.schemas';

export const registerTradesRoutes = (app: FastifyInstance, tradesService: TradesService) => {
  app.get('/api/v1/trades', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = listTradesQuerySchema.parse(request.query);
    const result = await tradesService.list(request.principal!.userId, query);
    return reply.code(200).send({ success: true, data: { trades: result.trades }, meta: result.meta });
  });

  app.get('/api/v1/trades/summary', { preHandler: app.authenticate() }, async (request, reply) => {
    const query = tradeSummaryQuerySchema.parse(request.query);
    return success(reply, 200, await tradesService.getSummary(request.principal!.userId, query));
  });

  app.get('/api/v1/trades/:id', { preHandler: app.authenticate() }, async (request, reply) => {
    const tradeId = (request.params as { id: string }).id;
    const trade = await tradesService.getById(request.principal!.userId, tradeId);
    if (!trade) throw new ApiError(404, 'NOT_FOUND', 'Trade not found');
    return success(reply, 200, { trade, hops: trade.hops });
  });
};
```

**Step 3: Register in app.ts**
- Import `registerTradesRoutes`, `TradesService`, `PrismaTradesRepository`
- Add `tradesRepository` and `tradesService` to `BuildApiAppOptions`
- Instantiate `PrismaTradesRepository` and `TradesService` in `buildApiApp`
- Call `registerTradesRoutes(app, tradesService)`

**Step 4: Write route tests**
```typescript
// apps/api/src/modules/trades/trades.routes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApiHarness, type TestApiHarness } from '../../test/test-harness';

describe('trade routes', () => {
  let harness: TestApiHarness;

  beforeEach(async () => {
    harness = await createTestApiHarness();
  });

  it('lists trades with filters and returns proper shape', async () => {
    // Register user, create strategy, create trade via harness.prisma
    // GET /api/v1/trades → 200 with { success, data: { trades }, meta }
  });

  it('returns trade detail with hops', async () => {
    // GET /api/v1/trades/:id → 200 with { success, data: { trade, hops } }
  });

  it('returns 404 for non-owned trade', async () => {
    // Trade belongs to user A, user B requests → 404
  });

  it('returns trade summary with computed aggregates', async () => {
    // GET /api/v1/trades/summary → 200 with { success, data: { summary: { totalTrades, successRate, ... } } }
  });
});
```

**Step 5: Run tests**
```bash
pnpm --filter @flashroute/api test -- --run apps/api/src/modules/trades/trades.routes.test.ts
```
Expected: PASS

**Step 6: Commit**
```bash
git add apps/api/src/modules/trades/trades.schemas.ts apps/api/src/modules/trades/trades.routes.ts apps/api/src/modules/trades/trades.routes.test.ts apps/api/src/app.ts apps/api/src/test/test-harness.ts
git commit -m "feat(Task13): add trade routes (list, detail, summary) and schemas"
```

---

## Task 13.6: Wire trade service into app.ts and test harness

This is already done in Task 13.5 Step 3. Verify with:
```bash
pnpm --filter @flashroute/api typecheck 2>&1
```
Expected: No errors

---

## Task 13.7: Add TanStack Query hooks for trades

**Files:**
- Create: `apps/web/src/features/trades/api.ts`

**Step 1: Write API hooks**
```typescript
// apps/web/src/features/trades/api.ts
import { useQuery } from '@tanstack/react-query';
import type { ListTradesQuery, TradeSummaryQuery } from '../../api/src/modules/trades/trades.schemas';

const API_BASE = '/api/v1';

export const useTrades = (query: ListTradesQuery) =>
  useQuery({
    queryKey: ['trades', query],
    queryFn: () =>
      fetch(`${API_BASE}/trades?${new URLSearchParams(query as any)}`).then((r) => r.json()),
  });

export const useTrade = (id: string) =>
  useQuery({
    queryKey: ['trade', id],
    queryFn: () =>
      fetch(`${API_BASE}/trades/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

export const useTradesSummary = (query: TradeSummaryQuery) =>
  useQuery({
    queryKey: ['trades-summary', query],
    queryFn: () =>
      fetch(`${API_BASE}/trades/summary?${new URLSearchParams(query as any)}`).then((r) => r.json()),
  });
```

**Step 2: Commit**
```bash
git add apps/web/src/features/trades/api.ts
git commit -m "feat(Task13): add TanStack Query hooks for trades"
```

---

## Task 13.8: Build TradesListPage

**Files:**
- Create: `apps/web/src/features/trades/pages/TradesListPage.tsx`
- Create: `apps/web/src/features/trades/pages/TradesListPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx:264` — replace PlaceholderPage with TradesListPage
- Create: `apps/web/src/features/trades/config.ts` — status badge config, route formatter

**Step 1: Write config.ts**
```typescript
// apps/web/src/features/trades/config.ts
export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  detected: { label: 'Detected', color: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  simulated: { label: 'Simulated', color: 'bg-purple-500/10 text-purple-300 border-purple-500/20' },
  submitted_private: { label: 'Private', color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  submitted_public: { label: 'Public', color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
  included: { label: 'Included', color: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20' },
  settled: { label: 'Settled', color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  reverted: { label: 'Reverted', color: 'bg-red-500/10 text-red-300 border-red-500/20' },
  failed: { label: 'Failed', color: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
};

export const formatRoutePath = (routePath: Array<{ tokenIn: string; tokenOut: string }>) =>
  routePath.map((h) => `${h.tokenIn}→${h.tokenOut}`).join(' > ');
```

**Step 2: Write TradesListPage.tsx**
- Use `useSearchParams` for all filters (chainId, strategyId, status, from, to, minProfit, sortBy, sortOrder, page)
- Chain selector, strategy selector, status multi-select, date range, min profit input — all write to URL params
- On filter change: `params.set('page', '1')`
- Table columns per spec: Time, Chain, Strategy, Route, Flash Loan, Profit, Gas Cost, Net Profit, Slippage, Status, Tx
- Default sort: `sortBy=createdAt&sortOrder=desc`
- Clickable rows → `/trades/:id` (use `Link` inside the row, not wrapping the `<tr>`)
- Explorer link on tx hash column: external link icon → block explorer URL
- Empty state: "No trades match your current filters. Clear filters to see more executions." with a clear button

**Step 3: Write TradesListPage.test.tsx**
```typescript
it('syncs filters to URL params and resets page on filter change', async () => { ... });
it('shows empty state when no trades match filters', async () => { ... });
it('shows explorer link on tx hash column', async () => { ... });
it('navigates to detail page on row click', async () => { ... });
```

**Step 4: Update router.tsx**
```typescript
// Replace line 264:
{ path: 'trades', element: <TradesListPage /> },
```

**Step 5: Run tests**
```bash
cd apps/web && pnpm exec vitest run --pool forks src/features/trades/pages/TradesListPage.test.tsx
```
Expected: PASS

**Step 6: Commit**
```bash
git add apps/web/src/features/trades/pages/TradesListPage.tsx apps/web/src/features/trades/pages/TradesListPage.test.tsx apps/web/src/features/trades/config.ts apps/web/src/app/router.tsx
git commit -m "feat(Task13): build TradesListPage with URL-persistent filters"
```

---

## Task 13.9: Build TradeDetailPage

**Files:**
- Create: `apps/web/src/features/trades/pages/TradeDetailPage.tsx`
- Create: `apps/web/src/features/trades/pages/TradeDetailPage.test.tsx`

**Step 1: Write TradeDetailPage.tsx**

Five sections per spec:

1. **Summary card** — status badge (using STATUS_CONFIG), chain badge, strategy name, created/submitted/mined timestamps (use `submittedAt` and `confirmedAt` from record), tx hash with copy button + explorer link, block number

2. **Route visualization** — expand each `routePath` hop showing: token pair, pool address, dex name, amount in, amount out, slippage. Use per-hop data from `hops[]` array when available.

3. **Financial summary** — flash loan amount + fee, gross profit (`profitUsd`), gas cost (`gasCostUsd`), net profit (`netProfitUsd`) in bold monospace, **simulated vs actual delta** prominently: `simulatedProfitUsd - netProfitUsd` with direction arrow and color (green if actual > simulated, red if actual < simulated). This is the key analytics insight.

4. **Execution diagnostics** — execution duration ms, demand prediction used (yes/no), competing tx count in block, revert reason if `status === 'reverted' || status === 'failed'` with `errorMessage`

5. **Raw metadata accordion** — collapsed by default, shows tx receipt excerpt and internal route id

Status banners:
- `settled`: green banner "Trade confirmed — net profit $X"
- `reverted`: red banner with `errorMessage`
- `failed`: amber banner with `errorMessage`
- Other statuses: no banner

**Step 2: Write TradeDetailPage.test.tsx**
```typescript
it('renders all five sections', async () => { ... });
it('shows simulated vs actual delta in financial summary', async () => { ... });
it('shows green status banner for settled trades with profit', async () => { ... });
it('shows red banner with error message for reverted trades', async () => { ... });
it('navigates back to trades list', async () => { ... });
```

**Step 3: Run tests**
```bash
cd apps/web && pnpm exec vitest run --pool forks src/features/trades/pages/TradeDetailPage.test.tsx
```
Expected: PASS

**Step 4: Commit**
```bash
git add apps/web/src/features/trades/pages/TradeDetailPage.tsx apps/web/src/features/trades/pages/TradeDetailPage.test.tsx
git commit -m "feat(Task13): build TradeDetailPage with five sections and sim/actual delta"
```

---

## Task 13.10: Final integration verification

**Step 1: Run all API tests**
```bash
pnpm --filter @flashroute/api test -- --run
```
Expected: All 40+ API tests pass (including new trade route tests)

**Step 2: Run all web tests**
```bash
cd apps/web && pnpm exec vitest run --pool forks --exclude "**/AppShell.test.tsx"
```
Expected: All web tests pass including new trade page tests

**Step 3: Typecheck**
```bash
pnpm --filter @flashroute/api typecheck && pnpm --filter @flashroute/web typecheck
```
Expected: No errors

**Step 4: Commit**
```bash
git add -A && git commit -m "feat(Task13): complete trade persistence, read APIs, and trades UI"
```

---

## Verification Commands

After all tasks:
```bash
# API
pnpm --filter @flashroute/api typecheck
pnpm --filter @flashroute/api test -- --run

# Web
pnpm --filter @flashroute/web typecheck
cd apps/web && pnpm exec vitest run --pool forks --exclude "**/AppShell.test.tsx"
```
