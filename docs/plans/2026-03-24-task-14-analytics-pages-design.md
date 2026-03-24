# Task 14 Design — Analytics Pages

## Overview

Build the Analytics page (`/analytics`) for Phase D. Multi-tab analytical reporting surface — Overview, Routes, Competitors, Gas tabs. Each tab fetches independently, persists state in URL query params, and handles loading/error/empty gracefully.

**Backend:** 5 REST endpoints in `apps/api/src/modules/analytics/`. Read-only, aggregated from existing tables (`trades`, `daily_analytics`, `competitor_activity`). No new tables, no jobs-worker changes.

**Frontend:** Analytics page with tab routing, 4 Recharts chart components, and 3 data tables. Charts live in `apps/web/src/features/analytics/components/charts/`.

**Design principle:** Show real data where it exists. Show `--` or tooltip for fields that require Phase G jobs-worker or execution data that doesn't exist yet. Never show zeros or fabricated data.

---

## Decisions Made in Q&A

1. **Charts:** Add `recharts` to `apps/web` only (not `@flashroute/ui`). Recharts is battle-tested, already in artifact system, handles tooltips/axes/responsive containers.
2. **Competitor `ourWinRate`:** Denormalized counter in `daily_analytics.competitor_stats` JSON, written by jobs-worker (Phase G). Phase D: show `null` → frontend renders `--`.
3. **Gas metrics:** Trades-table-only. `currentBaseFeeGwei` from single `eth_gasPrice` RPC call (cached 5s). All other gas oracle data shows `--` until Phase G.
4. **Route aggregation:** SQL `GROUP BY route_path` at read time. Marked in code as candidate for pre-aggregation when volume warrants.
5. **Competitor aggregation:** SQL `GROUP BY bot_address` at read time over `competitor_activity`. Dataset bounded by 30-day cleanup.
6. **`analytics/overview` endpoint:** New purpose-built endpoint for Analytics Overview tab (separate from `dashboard`). Returns `profitTrend`, `volumeTrend`, `successRateTrend`, `dailyBreakdown` — exactly what charts need.
7. **Period standardization:** All analytics endpoints use `7d/30d/90d/all` (not spec's inconsistent `24h/7d/30d` for gas).
8. **GasBreakdownChart:** Dropped "vs network average" (no oracle data). Repurposed as per-chain gas cost stacked bar using our own trade data.

---

## Backend Design

### File Structure

```
apps/api/src/modules/analytics/
  analytics.routes.ts      — 6 GET endpoints (dashboard + 5 new)
  analytics.service.ts     — TradesService-like class
  analytics.schemas.ts     — Zod query schemas
  analytics.repository.ts  — SQL aggregation queries over existing tables
  analytics.routes.test.ts — 4 route tests
```

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/analytics/dashboard` | Bearer | Dashboard KPIs (existing per spec) |
| GET | `/api/v1/analytics/overview` | Bearer | **NEW** Overview tab charts |
| GET | `/api/v1/analytics/daily` | Bearer | Daily breakdown (existing per spec) |
| GET | `/api/v1/analytics/routes` | Bearer | Route performance (existing per spec) |
| GET | `/api/v1/analytics/competitors` | Bearer (trader+) | Competitor activity (existing per spec) |
| GET | `/api/v1/analytics/gas` | Bearer | Gas analytics (existing per spec) |

### Query Params (all analytics endpoints)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| chainId | integer | — | Filter by chain |
| period | enum | `7d` | `7d`, `30d`, `90d`, `all` |
| strategyId | UUID | — | For dashboard/daily only |
| startDate | ISO date | derived from period | Override period |
| endDate | ISO date | now | Override period |
| limit | integer | 20 | For routes/competitors |

### `GET /analytics/overview` Response

```json
{
  "success": true,
  "data": {
    "profitTrend": [{ "date": "2026-03-14", "cumulativeProfitUsd": 1234.56 }],
    "volumeTrend": [{ "date": "2026-03-14", "tradeCount": 28, "volumeUsd": 45000.00 }],
    "successRateTrend": [{ "date": "2026-03-14", "successRate": 87.5 }],
    "dailyBreakdown": [
      {
        "date": "2026-03-14",
        "grossProfitUsd": 145.67,
        "gasCostUsd": 12.34,
        "netProfitUsd": 133.33,
        "tradeCount": 28
      }
    ]
  }
}
```

**SQL:** `SELECT DATE(created_at) as date, SUM(netProfitUsd), SUM(gasCostUsd), SUM(profitUsd), COUNT(*) FROM trades WHERE userId=$1 AND createdAt BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1`. Cumulative computed in application layer.

### `GET /analytics/gas` Response (trades-table-only)

```json
{
  "success": true,
  "data": {
    "gas": {
      "currentBaseFeeGwei": 12.5,
      "avgBaseFee24h": null,
      "avgPriorityFee24h": null,
      "ourAvgGasCost": 2.34,
      "gasSpentTotalUsd": 823.45,
      "gasSavedByFlashbotsUsd": null,
      "optimalExecutionHours": null,
      "gasTrend": [{ "hour": "2026-03-23T14:00:00Z", "avgBaseFeeGwei": 12.1, "avgPriorityFeeGwei": 0.5 }]
    }
  }
}
```

- `currentBaseFeeGwei` → single `eth_gasPrice` RPC call, cached 5s in-memory per chain
- `avgBaseFee24h` → **null** (requires gas oracle, Phase G)
- `avgPriorityFee24h` → **null** (requires gas oracle, Phase G)
- `ourAvgGasCost` → `AVG(gasCostUsd)` from trades table
- `gasSpentTotalUsd` → `SUM(gasCostUsd)` from trades table
- `gasSavedByFlashbotsUsd` → **null** (requires execution data, Phase G)
- `optimalExecutionHours` → **null** (requires 7+ days history, Phase G)
- `gasTrend` → `SELECT DATE_TRUNC('hour', created_at), AVG(gasUsed * gasPriceGwei) FROM trades GROUP BY 1` for last 24h

### `GET /analytics/competitors` Response

```json
{
  "success": true,
  "data": {
    "competitors": [{
      "botAddress": "0xabc...",
      "tradeCount": 456,
      "estimatedProfitUsd": 23456.78,
      "avgGasPriceGwei": 2.5,
      "mostUsedRoutes": ["WETH→USDC→WETH"],
      "firstSeenAt": "...",
      "lastSeenAt": "..."
    }],
    "totalCompetitorTrades": 12345,
    "ourWinRate": null
  }
}
```

- `ourWinRate` → **null** until Phase G jobs-worker populates `daily_analytics.competitor_stats`
- Aggregated from `competitor_activity` grouped by `bot_address`
- `mostUsedRoutes` → application-level aggregation of `routePath` JSON

### `GET /analytics/routes` Response

```json
{
  "success": true,
  "data": {
    "routes": [{
      "routeKey": "WETH→USDC→DAI→WETH",
      "dexes": "uniswap_v3→curve→sushiswap",
      "executionCount": 89,
      "successCount": 78,
      "totalProfitUsd": 1234.56,
      "avgProfitUsd": 15.83,
      "avgSlippagePct": 0.18,
      "avgExecutionTimeMs": 134,
      "lastExecutedAt": "..."
    }]
  }
}
```

**SQL:** `SELECT routePath, COUNT(*), SUM(CASE WHEN status IN ('settled','included') THEN 1 ELSE 0 END), AVG(netProfitUsd), MAX(createdAt) FROM trades WHERE userId=$1 GROUP BY routePath ORDER BY totalProfitUsd DESC`.

---

## Frontend Design

### File Structure

```
apps/web/src/features/analytics/
  api.ts                      — useAnalyticsOverview, useAnalyticsRoutes,
                                useAnalyticsCompetitors, useAnalyticsGas
  config.ts                   — PERIOD_OPTIONS, CHAIN_SELECTOR, formatters
  pages/
    AnalyticsPage.tsx         — tab shell, period/chain selectors, tab router
    AnalyticsPage.test.tsx
    tabs/
      OverviewTab.tsx          — 3 charts + daily breakdown table
      OverviewTab.test.tsx
      RoutesTab.tsx            — route performance table
      RoutesTab.test.tsx
      CompetitorsTab.tsx       — competitor table
      CompetitorsTab.test.tsx
      GasTab.tsx               — gas stat cards + charts
      GasTab.test.tsx
  components/
    charts/
      ProfitChart.tsx          — AreaChart, cumulative profit
      VolumeChart.tsx          — BarChart, trade count + volume
      SuccessRateChart.tsx     — LineChart, success rate %
      HourlyGasChart.tsx       — LineChart, hourly gas trend
```

### Routing

- Tab: `?tab=overview|routes|competitors|gas` (default: `overview`)
- Period: `?period=7d|30d|90d|all` (default: `7d`)
- Chain: `?chainId=` (optional, default: all chains)

All params survive refresh and are shareable URLs.

### Chart Components (Recharts)

**`ProfitChart.tsx`:** `AreaChart` with gradient fill. Cumulative profit on YAxis, dates on XAxis. Custom tooltip with date + cumulative profit + daily delta. Period selector tabs (7d/30d/90d) inside card.

**`VolumeChart.tsx`:** `ComposedChart` with grouped bars — trade count (left YAxis, cyan-500) and volume USD (right YAxis, emerald-500). Same period selector pattern.

**`SuccessRateChart.tsx`:** `LineChart` with percentage YAxis (0-100). Emerald line. Reference lines at 50% (dashed) and user's actual rate. Shaded success band.

**`HourlyGasChart.tsx`:** `LineChart` with dual lines — our avg gas cost (cyan-400) and base fee from RPC (gray-400). XAxis = hour of day (0-23).

### Gas Tab Stat Cards

Using existing `StatCard` from `@flashroute/ui`:
- Total Gas Spent (`gasSpentTotalUsd`)
- Avg Gas Cost/Trade (`ourAvgGasCost`)
- Current Base Fee (`currentBaseFeeGwei`)

Fields that are null show `--` with tooltip explaining what populates it when.

### Tab States

Each tab independently handles:
- **Loading:** Skeleton matching the tab's layout shape
- **Error:** Error card with retry button
- **Empty:** Context-appropriate message ("No trades in this period", "No competitor activity detected")

---

## API Response Shapes

### `GET /api/v1/analytics/overview`
```typescript
interface AnalyticsOverviewResponse {
  success: true;
  data: {
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
  };
}
```

### `GET /api/v1/analytics/gas`
```typescript
interface AnalyticsGasResponse {
  success: true;
  data: {
    gas: {
      currentBaseFeeGwei: number | null;
      avgBaseFee24h: null;
      avgPriorityFee24h: null;
      ourAvgGasCost: number | null;
      gasSpentTotalUsd: number | null;
      gasSavedByFlashbotsUsd: null;
      optimalExecutionHours: null;
      gasTrend: Array<{ hour: string; avgBaseFeeGwei: number | null; avgPriorityFeeGwei: number | null }>;
    };
  };
}
```

### `GET /api/v1/analytics/competitors`
```typescript
interface Competitor {
  botAddress: string;
  tradeCount: number;
  estimatedProfitUsd: number;
  avgGasPriceGwei: number;
  mostUsedRoutes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

interface AnalyticsCompetitorsResponse {
  success: true;
  data: {
    competitors: Competitor[];
    totalCompetitorTrades: number;
    ourWinRate: null; // populated by Phase G jobs-worker
  };
}
```

### `GET /api/v1/analytics/routes`
```typescript
interface RouteAnalytics {
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

interface AnalyticsRoutesResponse {
  success: true;
  data: { routes: RouteAnalytics[] };
}
```

---

## Database Tables Used

| Table | Purpose |
|-------|---------|
| `trades` | All trade aggregation — profit, gas, volume, success rate, routes |
| `competitor_activity` | Competitor bot data, 30-day bounded |
| `daily_analytics` | Read `mostProfitableRoute` JSON, write `competitor_stats` JSON (Phase G) |
| SupportedChain | Chain metadata for gas RPC calls |

**No new tables.** All data from existing schema.

---

## Test Plan

### Backend (4 new route tests)
- `analytics/overview` → returns all 4 trend arrays, correct date range filtering
- `analytics/routes` → aggregates by route_path, correct success/fail counts
- `analytics/competitors` → aggregates by bot_address, ourWinRate is null
- `analytics/gas` → gasSpentTotalUsd from trades, currentBaseFeeGwei from mock RPC, null fields present

### Frontend (7 tests)
- `OverviewTab` → renders charts after data load, skeleton while loading
- `RoutesTab` → renders table with route data, empty state
- `CompetitorsTab` → renders competitor table with explorer links, `--` for null win rate
- `GasTab` → renders stat cards + chart, null fields show `--`

### Test Harness
- `FakePrismaClient` needs `competitorActivity` added for competitors endpoint tests

---

## Dependencies

- `recharts` added to `apps/web/package.json` only
- No `@flashroute/ui` changes — existing `StatCard`, `Card`, `Button` sufficient
- No database migrations

---

## Spec Discrepancies Addressed

1. **Period inconsistency:** Spec's gas endpoint used `24h/7d/30d`. All analytics endpoints now use `7d/30d/90d/all`.
2. **GasBreakdownChart dropped:** "vs network average" requires gas oracle. Replaced with `HourlyGasChart` showing our gas cost trend from trades table.
3. **`ourWinRate` null:** Competitors endpoint returns `null` for `ourWinRate` until Phase G jobs-worker runs. Frontend shows `--`.

---

## Design Approved

- Period standardization: ✅
- GasBreakdownChart repurposed: ✅
- All other decisions per Q&A: ✅
