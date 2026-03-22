# Frontend Pages — Core Product: FlashRoute

---

## Overview

These are the main dashboard and product pages used by paying customers to monitor live opportunities, configure strategies, inspect trades, review pools, and analyze performance. All pages use the authenticated `AppShell` layout defined in the design system and depend on REST endpoints for initial data plus websocket channels for live updates where noted.

Implementation should use TanStack Query for list/detail fetching, URL query params for persistent filters, and optimistic updates only for safe reversible actions such as toggling strategy activation. Every page must explicitly support loading, background-refresh, empty, error, and permission-gated states.

**Estimated LOC:** 8,000-12,000

---

## Global Core-Page Conventions

### Shared query/URL patterns
- Pagination, sort, filters, selected chain, and date range should live in URL search params on list pages.
- `page`, `pageSize`, `sort`, `order`, `chainId`, `status`, `strategyId`, `from`, `to`, and search terms should survive refresh/share.
- When filters change, reset page to 1.

### Live data patterns
Pages using websocket streams must:
- render last known data while connected/disconnected state changes
- show `LiveIndicator` in page header or relevant card
- highlight newly inserted rows/cards for 2.5 seconds
- dedupe websocket events against existing cached entities by `id`
- fall back to background polling when socket disconnects

### Permission and plan gating
- free/monitor plans may access dashboards and limited analytics but not strategy execution creation if business rules say so
- executor-only features should render upgrade CTA, not dead buttons
- actions hidden by RBAC should not render

---

## Page: Dashboard (`/dashboard`)

### Purpose
Single-screen operational summary of profitability, strategy health, recent executions, and live system alerts.

### Data sources
- `GET /api/v1/analytics/dashboard?period=7d|30d|90d&chainId=...`
- websocket subscriptions: `trades:live`, `system:alerts`, optionally `opportunities:summary`

### Layout
1. top bar with period selector, chain selector, manual refresh button, live indicator
2. KPI stat row
3. main chart row
4. lower row with top strategies and recent trades
5. alert banner region if system warnings present

### KPI cards
Required cards:
- Total Profit (USD)
- Today’s Profit (USD)
- Success Rate (%)
- Active Strategies
- optional fifth card on wider screens: Live Opportunities count

Each card includes:
- current value
- delta vs prior equivalent period
- tooltip explaining metric source
- loading skeleton

### Chart section
Primary card contains `ProfitChart` with 7d/30d/90d tabs. Secondary card may contain `SuccessRateChart` or small `VolumeChart` on `xl+` screens.

### Recent trades section
Show latest 5 trades with columns:
- Time
- Route
- Net Profit
- Gas
- Status
- Tx link icon

Click row opens `/trades/:id`.

### States
- **Loading:** stat skeletons, chart skeleton, table skeletons
- **Error/no data:** full error panel with retry
- **Success/empty history:** empty state encouraging strategy creation
- **Success with stale websocket:** keep data, show yellow banner `Live updates paused; refreshing every 15 seconds.`

### Responsive behavior
- mobile: KPI cards stack 2 per row; chart full width; strategies/trades become vertical cards instead of dense tables
- desktop: 12-column grid with charts occupying 8/4 split or full row depending on data density

---

## Page: Strategies List (`/strategies`)

### Purpose
View all configured strategies, inspect status/performance, and navigate to create/edit/detail flows.

### API
`GET /api/v1/strategies?page=&pageSize=&chainId=&status=&search=`

### Header actions
- `New Strategy` primary CTA
- search input by strategy name
- chain filter
- status filter (`all`, `active`, `paused`, `draft`)

### Table columns
| Column | Data | Notes |
|---|---|---|
| Name | `strategy.name` | linked to detail page |
| Chain | `ChainBadge` | sortable |
| Status | badge + toggle | toggle mutation with rollback |
| Min Profit | USD | monospace right-aligned |
| Max Hops | integer | |
| Flash Provider | provider badge | `Auto`, `Aave`, `Balancer`, `dYdX` |
| Trades | execution count | |
| Profit | totalProfitUsd | `ProfitDisplay` |
| Last Run | relative time | |
| Actions | edit, delete | delete behind confirm dialog |

### Row actions
- toggle activate/deactivate -> `POST /api/v1/strategies/:id/activate` or `/deactivate`
- edit -> `/strategies/:id/edit`
- delete -> `DELETE /api/v1/strategies/:id`

### Mutation rules
- activate/deactivate may be optimistic if endpoint is reliable; on failure rollback and toast
- delete requires confirm dialog with text: `Delete strategy “{name}”? Historical trades remain, but this strategy configuration will be removed.`

### Empty state
`No strategies configured. Create your first strategy to start finding arbitrage opportunities.` CTA goes to `/strategies/new`.

---

## Page: Strategy Create/Edit (`/strategies/new`, `/strategies/:id/edit`)

### Purpose
Configure arbitrage strategy parameters used by backend scanning and execution services.

### Data dependencies
- `GET /api/v1/chains`
- `GET /api/v1/strategies/:id` for edit
- DEX choices and flash-loan provider choices are loaded from the chain-scoped frontend configuration and constrained by the strategy schema defined in the package; the MVP does not require separate `/dexes` or `/flash-loan/providers` endpoints

### Form layout
Use a multi-section card form with sticky action footer on desktop.

#### Section 1: Basic configuration
- Name
- Chain
- Description (optional, internal notes)

Validation:
- name required, 3-100 chars
- chain required
- name uniqueness can be checked only server-side

#### Section 2: Trading parameters
- Min Profit USD
- Max Trade Size USD
- Max Hops
- Risk Buffer %
- Max Gas Price Gwei
- Max Slippage Bps
- Cooldown Seconds between executions

Validation rules:
- min profit > 0
- max trade size >= min trade unit and <= product-configured upper bound
- max hops integer between 2 and 6
- risk buffer 0.01 to 5.0
- max gas price > 0
- max slippage bps between 1 and 500
- cooldown >= 0

#### Section 3: DEX selection
- checkbox grid of supported DEXes for chain
- require at least one DEX selected
- if chain changes, deselect unsupported DEXes and show non-blocking warning toast

#### Section 4: Flash loan and execution options
- Flash Loan Provider: Auto, Aave, Balancer, dYdX
- Use Flashbots toggle
- Use Demand Prediction toggle
- Dry Run / Monitor Only toggle if product supports non-executing strategies

#### Section 5: Advanced risk controls
- blacklist tokens input (chip entry)
- whitelist tokens input optional
- minimum pool liquidity USD
- max pending tx count threshold
- stop after N consecutive failures

### API mappings
Create:
`POST /api/v1/strategies`

Edit:
`PATCH /api/v1/strategies/:id`

Payload should match field names exactly and coerce numeric strings to numbers before send.

### Save behaviors
- primary CTA: `Create Strategy` or `Save Changes`
- secondary CTA: `Cancel`
- optional tertiary on edit: `Duplicate Strategy`
- after success redirect to strategy detail with success toast
- if form is dirty and user navigates away, show unsaved changes prompt

### Server error mapping
Backend may return validation errors such as unsupported DEX-chain pair or invalid gas threshold. Map these back to precise fields or section-level alerts.

### Responsive behavior
- mobile: sections stack, sticky action footer with safe-area inset
- desktop: two-column grid for numeric fields, full-width checkbox grids below

---

## Page: Strategy Detail (`/strategies/:id`)

### Purpose
Detailed operational view for one strategy: configuration, status, recent performance, and trade history.

### API
- `GET /api/v1/strategies/:id`
- `GET /api/v1/trades?strategyId=:id`
- `GET /api/v1/analytics/daily?strategyId=:id&startDate=&endDate=`
- `GET /api/v1/analytics/routes?strategyId=:id&startDate=&endDate=`
- websocket: `strategy:{id}:events` if available

### Sections
1. summary header card: name, chain, status, provider, created date, last updated
2. action bar: activate/deactivate, edit, duplicate, delete
3. performance stat row: trades, success rate, total profit, avg profit, best trade
4. chart: profit over time for selected period
5. config summary grid with all parameters
6. trade history table filtered to this strategy
7. recent system events timeline (activations, failures, threshold changes) if backend exposes it

### Edge cases
- strategy deleted or not found -> 404 empty/error state with CTA back to list
- strategy exists but no trades -> keep config visible and show trade empty state
- live execution paused globally -> warning banner that strategy cannot execute until maintenance mode is lifted

---

## Page: Trades (`/trades`)

### Purpose
Full historical trade execution log with filtering, sorting, and export.

### API
`GET /api/v1/trades?page=&pageSize=&chainId=&strategyId=&status=&from=&to=&minProfit=&sort=`
CSV export is deferred from the MVP package. If export is needed later, it should be added as a dedicated endpoint after the core trade history flow is stable.

### Filters
- chain selector
- strategy selector
- status multi-select
- date range picker
- min profit input
- search by tx hash / address if supported

### Table columns
| Column | Data |
|---|---|
| Time | relative time + exact tooltip |
| Chain | chain badge |
| Strategy | strategy name |
| Route | compact route path |
| Flash Loan | provider badge + amount |
| Profit | gross profit |
| Gas Cost | USD |
| Net Profit | bold monospace |
| Slippage | percentage |
| Status | tx status badge |
| Tx | explorer link |

### Behavior
- default sort: newest first
- secondary sorts allowed: net profit, gas cost
- paginated at 20 rows by default
- clickable row -> detail page except direct click on explorer icon should open external link only
- export button downloads CSV using current filters

### Empty states
- no trades ever -> onboarding-style empty state
- filters produced no results -> `No trades match your current filters. Clear filters to see more executions.`

---

## Page: Trade Detail (`/trades/:id`)

### Purpose
Forensic-level view of one execution for debugging, customer reporting, and validation of simulation vs actual outcome.

### API
`GET /api/v1/trades/:id`

### Sections
1. **Summary card**
   - status badge
   - chain
   - strategy
   - created/submitted/mined timestamps
   - tx hash with copy + explorer link
   - block number
2. **Route visualization**
   - expanded `RoutePath`
   - each hop shows token pair, pool, dex, amount in, amount out, slippage, fee tier
3. **Financial summary**
   - flash loan amount
   - flash loan fee
   - gross profit
   - gas cost
   - net profit
   - simulated profit vs actual profit delta
4. **Execution diagnostics**
   - execution duration ms
   - demand prediction used yes/no
   - predicted congestion score
   - competing tx count in block
   - revert reason if failed/reverted
5. **Raw metadata accordion**
   - tx receipt excerpt
   - internal route id
   - simulation id

### Status-specific UI
- confirmed -> green success banner if profitable
- reverted -> red banner with revert reason and recommended troubleshooting copy
- failed before submission -> gray/amber banner with service-side failure explanation

### Responsive behavior
- financial summary collapses to stacked key-value cards on mobile
- route visualization switches from horizontal hop flow to vertical stepper

---

## Page: Opportunities (`/opportunities`)

### Purpose
Live discovery surface for current profitable routes identified by the analytics engine.

### API
- `GET /api/v1/routes/opportunities?chainId=&page=&pageSize=`
- websocket: `opportunities:{chainId}`

### Header controls
- chain selector
- minimum estimated profit filter
- confidence threshold filter
- pause live updates toggle (UI only) for analysts who want stable reading

### Card/table data fields
| Field | Data |
|---|---|
| Route | route path |
| Estimated Profit | formatted USD |
| Confidence | percentage/progress |
| Flash Loan | token + amount |
| Gas Estimate | USD |
| Expires | countdown timer |
| Demand Prediction | impact badge |
| Action | inspect route or create strategy from route |

### Live behavior
- new opportunities prepend or appear at top sorted by estimated profit/time discovered
- expired opportunities fade then remove
- if live paused by user, buffer incoming events count and offer `Resume (12 new)` action

### Empty/error states
- empty but connected: `No profitable opportunities at the moment. The analytics engine is scanning continuously.`
- disconnected: differentiate from empty; show offline banner and stale timestamp

---

## Page: Pools (`/pools`)

### Purpose
Inspect monitored liquidity pools and their relevance to arbitrage routes.

### API
- `GET /api/v1/pools?chainId=&dex=&token=&minTvl=&page=`
- `GET /api/v1/pools/:id` for detail if implemented

### List page filters
- chain
- DEX
- token search
- minimum TVL
- recently updated toggle

### Table columns
| Column | Data |
|---|---|
| Pair | token pair display |
| DEX | dex badge |
| Fee | bps |
| TVL | USD |
| 24h Volume | USD |
| Last Updated | time ago |
| Used in Recent Routes | count |

Click row -> pool detail drawer or page.

### Pool detail content
- reserve chart from `pool_snapshots`
- recent swaps list
- recent arbitrage routes involving this pool
- raw addresses for pool and tokens

---

## Page: Analytics (`/analytics`)

### Purpose
Multi-tab analytical reporting beyond dashboard summaries.

### Tabs
- Overview
- Routes
- Competitors
- Gas

Persist selected tab in query param.

### Overview tab
API: `GET /api/v1/analytics/dashboard?period=&chainId=`

Contains:
- cumulative `ProfitChart`
- `VolumeChart`
- `SuccessRateChart`
- daily breakdown table with gross profit, gas, net profit, trade count

### Routes tab
API: `GET /api/v1/analytics/routes?period=&chainId=`

Table columns:
- route path
- execution count
- success rate
- total profit
- avg profit
- last executed

### Competitors tab
API: `GET /api/v1/analytics/competitors?period=&chainId=`

Table columns:
- bot address
- trade count
- estimated profit
- most used routes
- first seen
- last seen
- our win rate against this competitor

Need copy+explorer support for addresses.

### Gas tab
API: `GET /api/v1/analytics/gas?period=&chainId=`

Contains:
- hourly average gas chart
- optional heatmap of profitable hours if backend exposes it
- total gas spent
- total gas saved via Flashbots/private relays
- recommended execution windows

### Shared tab states
Each tab handles loading/error/empty independently while preserving tab chrome.

---

## Core Page Test Expectations

The coding agent should implement tests for:
- dashboard skeleton -> data render transition
- websocket event insertion into recent trades/opportunities lists
- strategy form validation and DEX reset on chain change
- strategy activation rollback on mutation error
- trades page filter URL sync
- trade detail status-specific banners
- analytics tab persistence and data fetching per tab
- mobile rendering paths for tables converted to cards where specified
