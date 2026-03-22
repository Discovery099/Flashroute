# Frontend State Management: FlashRoute

---

## Objective

The FlashRoute frontend has two very different data lifecycles:

1. **Server state** changing constantly from APIs and WebSocket pushes: opportunities, trade history, analytics, health status, billing status, alert lists, strategy data
2. **Client state** representing local UI concerns: auth session bootstrap status, selected chain, table filters, open modals, persisted display preferences, in-progress form drafts, connection banners

This file defines a strict separation of concerns using **TanStack Query v5** for server state and **Zustand** for client state. Do not blur the two. The most common frontend failure in real-time dashboards is duplicating server truth into local stores and then fighting stale data forever.

**Estimated implementation LOC:** 3,500–5,500 across API client, query keys, hooks, stores, WebSocket integration, persistence, and cache invalidation helpers.

---

## State Architecture Principles

### 1. Server State Lives in Query Cache

Use TanStack Query for anything that:
- comes from backend endpoints
- can be refetched
- needs stale/fresh policy
- may be shared by multiple pages
- should survive route transitions within the app session

Examples:
- current user profile
- strategies list
- dashboard analytics
- live opportunities snapshot
- paginated trades
- billing subscription
- admin health data

### 2. Client State Lives in Zustand

Use Zustand for anything that:
- is purely local UI state
- should persist in `localStorage` or `sessionStorage`
- orchestrates non-server workflows
- tracks WebSocket connectivity
- stores ephemeral filters or panel state

Examples:
- selected chain for dashboard context
- sidebar collapsed state
- dismissed announcement banners
- currently open modal
- toast queue
- auth bootstrap flags
- active live subscription channels

### 3. WebSocket Does Not Replace Query

WebSocket messages are treated as **incremental updates** to query caches and a small connection store. They are not the primary source of truth for all app state. Pages still bootstrap with REST responses, then receive patches via WebSocket.

### 4. One Direction for Data Refresh

Mutation sequence pattern:
1. run API mutation
2. on success, optimistically patch where safe
3. invalidate or update related query keys
4. let canonical server responses rehydrate the final state

Do not directly mutate multiple unrelated stores on every mutation without query reconciliation.

---

## Folder Structure

Suggested frontend structure:

```text
src/
  api/
    client.ts
    interceptors.ts
    types.ts
  state/
    stores/
      auth.store.ts
      ui.store.ts
      preferences.store.ts
      live.store.ts
      filters.store.ts
    query/
      queryClient.ts
      queryKeys.ts
      auth.queries.ts
      strategy.queries.ts
      trade.queries.ts
      analytics.queries.ts
      billing.queries.ts
      admin.queries.ts
    websocket/
      wsClient.ts
      wsEvents.ts
      wsHandlers.ts
      subscriptions.ts
```

---

## API Client and Query Client

### API Client Responsibilities

Single `apiClient` wrapper around fetch or Axios with:
- base URL from environment
- automatic access token injection
- 401 interception with refresh flow
- request timeout handling
- normalized error shape
- support for abort signals from React Query

Normalized error interface:

```ts
interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
}
```

### Query Client Defaults

Recommended defaults:
- `retry`: 1 for most queries, 0 for auth-sensitive or validation failures
- `refetchOnWindowFocus`: false for heavy dashboard queries, true for user/session queries if cheap
- `staleTime`: tuned per domain, not global one-size-fits-all
- `gcTime`: longer for analytics pages, shorter for live opportunities

Base query client config guidance:
- auth/session: staleTime 60s
- dashboard overview: staleTime 15s
- opportunities snapshot: staleTime 3s
- static data like chains/token metadata: staleTime 30m+
- admin system health: staleTime 10s

---

## Query Key Design

All keys must be hierarchical and parameterized.

```text
['auth', 'me']
['auth', 'sessions']
['dashboard', { period }]
['strategies', 'list', { chainId, status }]
['strategies', 'detail', strategyId]
['trades', 'list', { page, chainId, status, strategyId, dateRange, minProfit }]
['trades', 'detail', tradeId]
['opportunities', { chainId }]
['analytics', 'overview', { period, chainId }]
['analytics', 'routes', { period, chainId }]
['analytics', 'gas', { period, chainId }]
['billing', 'subscription']
['billing', 'plans']
['alerts', 'list']
['admin', 'users', filters]
['admin', 'system-health']
['api-keys', 'list']
```

Rules:
- Never use string-concatenated keys
- Include filter objects exactly as the page needs them
- Keep detail keys separate from lists
- Use stable object shapes so cache misses aren’t caused by inconsistent parameter ordering

---

## Zustand Stores

### 1. `auth.store.ts`

Purpose: session bootstrap and token lifecycle, not full user profile caching.

State:
- `accessToken: string | null`
- `refreshInFlight: boolean`
- `isBootstrapping: boolean`
- `isAuthenticated: boolean`
- `postLoginRedirect: string | null`
- `logoutReason: 'manual' | 'expired' | 'revoked' | null`

Actions:
- `setAccessToken(token)`
- `beginBootstrap()`
- `finishBootstrap(authenticated)`
- `setPostLoginRedirect(path)`
- `clearPostLoginRedirect()`
- `markRefreshInFlight(flag)`
- `logout(reason)`

Storage:
- access token should preferably remain in memory only
- refresh token is backend-managed via secure cookie or equivalent server-safe mechanism
- `postLoginRedirect` may be persisted in session storage

### 2. `ui.store.ts`

Purpose: app-shell and modal state.

State:
- `sidebarCollapsed`
- `currentModal: null | { type: string; payload?: unknown }`
- `commandPaletteOpen`
- `mobileNavOpen`
- `globalBanner: null | BannerConfig`
- `toasts: ToastItem[]`

Actions:
- `toggleSidebar()`
- `openModal(type, payload)`
- `closeModal()`
- `pushToast(toast)`
- `removeToast(id)`
- `dismissBanner()`

Persistence:
- sidebar state persisted in local storage
- toasts are ephemeral only

### 3. `preferences.store.ts`

Purpose: operator preferences that personalize dashboards.

State:
- `selectedChainId`
- `dashboardPeriod`
- `profitDisplayMode: 'usd' | 'native'`
- `opportunitySort: 'netProfit' | 'confidence' | 'expiresAt'`
- `compactTables`
- `chartSmoothing`
- `soundAlertsEnabled`
- `timeZoneMode: 'local' | 'utc'`

Persistence:
- local storage
- version store schema so migrations are possible if keys change

### 4. `filters.store.ts`

Purpose: page-level filter snapshots for complex list pages.

State groups:
- `tradesFilters`
- `strategyFilters`
- `poolFilters`
- `adminUserFilters`
- `analyticsFilters`

Behavior:
- each page initializes its filter form from this store
- URL search params remain sharable source for externally visible filters
- store acts as convenience memory between navigations, not a replacement for URL state on filter-heavy pages

### 5. `live.store.ts`

Purpose: connection and subscription orchestration.

State:
- `connectionStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'`
- `lastConnectedAt`
- `lastMessageAt`
- `latencyMs`
- `subscribedChannels: string[]`
- `missedHeartbeatCount`
- `connectionBannerDismissed`

Actions:
- `setConnectionStatus`
- `registerChannel`
- `unregisterChannel`
- `setLatency`
- `recordMessageReceived`
- `resetConnectionMetrics`

This store never owns actual opportunities/trades payloads except tiny recent-event metadata for debugging.

---

## Query Modules by Domain

### Auth Queries

#### `useMeQuery`
- endpoint: `GET /api/v1/users/me`
- enabled only when authenticated
- used by app bootstrap, header, settings
- staleTime: 60s

#### `useActiveSessionsQuery`
- endpoint: `GET /api/v1/auth/sessions`
- used only on security tab
- staleTime: 15s

Mutations:
- login
- register
- forgot password
- reset password
- verify email
- enable 2FA
- disable 2FA
- revoke session
- logout

Mutation side effects:
- login success: set token, invalidate `['auth', 'me']`, navigate to redirect/default dashboard
- logout success or local forced logout: clear auth store, reset query cache for user-scoped keys

### Strategy Queries

#### `useStrategiesListQuery(filters)`
Used on strategies list, dashboard summaries, strategy selector controls.

#### `useStrategyDetailQuery(strategyId)`
Used on strategy detail and edit form bootstrap.

Mutations:
- create strategy
- update strategy
- activate/deactivate strategy
- delete strategy

Cache effects:
- list invalidation after create/delete
- detail patch + list patch after toggle or edit
- dashboard invalidation after strategy status change

### Trade Queries

#### `useTradesListQuery(filters)`
Paginated; preserve previous page data while loading next page.

#### `useTradeDetailQuery(tradeId)`
Detailed route replay and financial summary.

Trade list pages should use placeholder skeletons only on first load; later filter or pagination transitions can use subtle loading overlays to prevent UI jump.

### Opportunities Queries

#### `useOpportunitiesQuery(chainId)`
Bootstrap snapshot from REST, then continuously patch with WebSocket events.

Cache policy:
- staleTime: 3s
- refetch interval optional only when WS disconnected
- when connected via WS, rely on event-driven updates plus periodic reconciliation every 30–60s

### Analytics Queries

Separate queries by tab to avoid fetching all analytics at once.
- overview
- routes
- competitors
- gas
- dashboard compact summary

Use `select` transforms carefully for chart-ready series but avoid expensive recomputation on every render; memoize where needed.

### Billing Queries

- subscription
- plans/features
- checkout preview if implemented
- invoices/portal metadata if available

### Admin Queries

- users list with filters and pagination
- system health
- config list
- audit/event log if later added

Admin queries should be gated by role and never even attempt fetch when user lacks permission.

---

## WebSocket State Integration

### Connection Lifecycle

1. User authenticates or lands on a public page that doesn’t require WS → no socket needed
2. Authenticated dashboard route mounts → `wsClient.connect()`
3. Socket authenticates using access token or one-time WS auth handshake
4. Subscription manager registers route-relevant channels
5. Incoming messages patch query cache or raise toasts/banners
6. On disconnect, `live.store` updates banner state and fallback polling activates where appropriate

### Channel Strategy

Examples:
- `trades:live`
- `opportunities:<chainId>`
- `system:alerts`
- `admin:health`
- `strategy:<strategyId>:updates`

Subscriptions should be route-aware. Do not stay subscribed to high-volume channels when pages unmount unless a global dashboard component still depends on them.

### Message Handling Pattern

Each message type goes through a typed handler:
- validate payload shape with Zod
- map event to cache updates
- emit toast only if operator-facing
- ignore unknown events safely and log in development

Examples:

#### Opportunity Created/Updated
- patch `['opportunities', { chainId }]`
- insert at top or update by `routeId`
- prune expired items beyond list limit

#### Trade Confirmed
- prepend into dashboard recent trades
- update trades list first page if matching filters
- invalidate dashboard stats or patch totals if payload is sufficient
- optionally play sound if enabled

#### System Alert
- push toast/banner
- if admin page open, patch health query or alert feed cache

### Reconnection Policy

- exponential backoff with jitter: 1s, 2s, 5s, 10s, max 30s
- after reconnect, resubscribe all active channels
- trigger refetch of volatile queries: opportunities, dashboard, health
- show dismissible banner when disconnected > 5 seconds

---

## Form State Rules

All forms use React Hook Form + Zod. Do not place raw form fields in Zustand unless drafts must persist across navigation or refresh.

### Strategy Form

Local form state only, with optional draft persistence when form is large.
If draft persistence is added:
- key by `strategy:create` or `strategy:edit:<id>`
- clear draft on successful save
- include versioning so schema changes can invalidate old drafts

### Billing / Contact Forms

Keep local only. Do not persist sensitive billing or sales form inputs unless explicitly needed.

### Filter Forms

For sharable pages, flow is:
1. initialize from URL params
2. sync into local component form state
3. on submit/change, update URL + filters store snapshot
4. queries derive from URL or a normalized filter object

---

## Persistence Strategy

### Local Storage

Persist only low-risk convenience settings:
- selected chain
- chart period
- compact mode
- sidebar collapsed
- sound alerts enabled
- time zone mode

### Session Storage

Use for:
- post-login redirect
- short-lived onboarding banners
- unfinished auth transitions if needed

### Never Persist

- access tokens beyond memory if avoidable
- raw API responses
- user PII not needed for convenience
- institutional contact notes
- sensitive admin config snapshots

---

## Cache Invalidation Matrix

| Mutation | Queries to patch/invalidate |
|---|---|
| Login | `auth/me`, any bootstrap config, optional billing/subscription |
| Logout | clear all user-scoped queries and WS subscriptions |
| Strategy create | invalidate strategies list, dashboard, opportunities if strategy affects auto-execution view |
| Strategy update | patch strategy detail, invalidate lists and dashboard summaries |
| Strategy toggle | patch list/detail, invalidate dashboard stats and opportunities if relevant |
| Strategy delete | invalidate strategy list, remove detail cache, invalidate dashboard |
| Alert create/update/delete | invalidate alerts list |
| API key create/revoke | invalidate api keys list |
| Profile update | patch `auth/me` |
| Plan checkout success | invalidate billing subscription, auth/me if role/entitlement derived there |
| Admin config change | invalidate system health/config list; possibly show forced refresh banner |

When patching list caches, use item identity keys (`id`) and avoid full array recreation if not needed for performance-sensitive tables.

---

## Auth Bootstrap Flow

On app load inside protected routes:
1. auth store enters `isBootstrapping=true`
2. attempt to hydrate via refresh mechanism
3. if refresh succeeds, fetch `auth/me`
4. if user fetch succeeds, mount protected shell and establish WS
5. if refresh fails, redirect to login and preserve intended path

Protected route component should render:
- full-screen loading shell during bootstrap
- redirect only after bootstrap conclusively fails
- never flash private page content before auth resolution

---

## Error State Handling

### Query Errors

Render by scope:
- page-blocking query → page `ErrorState`
- subpanel query → card-level error boundary with retry button
- background refetch failure with stale data present → subtle inline badge “Live updates delayed” rather than replacing working content

### Global Errors

Normalized API errors should map to consistent UX:
- 401 → refresh/logout flow
- 403 → permission denied page or inline guard
- 404 → route not found or record missing state
- 422 → form field errors
- 429 → toast/banner with retry suggestion
- 5xx → generic retry UI plus correlation ID if present

### Optimistic Updates

Use only for:
- toggles
- minor preference saves
- row-level quick actions with low conflict risk

Do not optimistically fake trade confirmations, billing changes, or admin health transitions.

---

## Performance Considerations

- Use query `select` to strip huge payloads into chart series only when the raw payload will not also be needed by the same component tree
- Virtualize long tables like trades and pools when row counts are high
- Avoid subscribing the whole app to giant Zustand stores; use selectors and shallow comparison
- WebSocket handlers must batch updates where possible to avoid excessive React renders during high-traffic periods
- For opportunities feeds, keep only recent N items in active cache (for example top 100) and let deep history remain server-side

---

## Testing Expectations for State Layer

At minimum, test:
- query key generation stability
- auth bootstrap success and failure paths
- refresh flow race condition handling
- WS reconnect and resubscribe behavior
- cache patching for opportunity and trade events
- persisted preferences hydration
- logout clearing user-scoped state
- strategy toggle optimistic update rollback on API failure

Detailed test inventory belongs in `20-FRONTEND-TESTS.md`, but the implementation must be designed for that testability now.

---

## Implementation Notes for Coding Agent

- Keep query logic in dedicated hooks/modules, not embedded in page components
- Keep Zustand stores tiny and domain-focused; five small stores are better than one giant kitchen-sink store
- Use TypeScript DTOs generated or mirrored from backend contract types; never leave API payloads as `any`
- Validate critical WebSocket payloads before mutating cache
- Always model real-time feeds as `snapshot + incremental event stream + periodic reconciliation`
- If a state decision becomes ambiguous, prefer TanStack Query over custom local caching and prefer URL state over hidden store state for list filters visible to users
