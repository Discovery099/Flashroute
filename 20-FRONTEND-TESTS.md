# Frontend Testing Specification: FlashRoute

---

## Objective

The FlashRoute frontend is not a brochure app. It contains authentication, billing, high-frequency live data, dense financial displays, admin controls, and risk-sensitive execution settings. The frontend test suite must prove that users see the right information, the right controls are gated by role and plan, and real-time updates do not corrupt the interface.

This file defines the full frontend testing strategy using **Vitest**, **Testing Library**, **MSW**, and targeted browser-level end-to-end coverage using **Playwright** or equivalent. The emphasis is on behavior, not snapshot spam.

**Estimated implementation LOC:** 4,500–6,500 including test utilities, mocks, fixtures, rendering helpers, MSW handlers, component/page tests, and end-to-end smoke and regression coverage.

---

## Test Stack

### Unit / Component / Integration
- **Vitest** as test runner
- **@testing-library/react** for component and page interaction tests
- **@testing-library/user-event** for realistic user interactions
- **MSW** for mocking REST endpoints
- mocked WebSocket adapter or message bus shim for real-time events

### Browser-Level Tests
- **Playwright** for critical route flows:
  - auth
  - strategy creation
  - billing checkout handoff
  - opportunities live feed rendering
  - admin permissions guard

### Supporting Test Utilities
- `renderWithProviders()` wrapping Router, QueryClientProvider, Zustand reset hooks, theme, and auth shell
- query client factory per test to avoid cross-test contamination
- fixture builders for users, strategies, trades, opportunities, billing subscriptions, alerts, admin health responses

---

## Test Pyramid

### 1. Unit Tests
Focus on deterministic pure behavior:
- formatting helpers
- filter normalization
- query key builders
- chart transform mappers
- websocket event reducers
- access-control helpers
- risk label and status badge logic

### 2. Component Tests
Focus on reusable UI pieces in isolation:
- tables
- cards
- forms
- modals
- route path visualization
- badges
- loading/error/empty states

### 3. Page Integration Tests
Focus on full page behavior with mocked APIs and route context:
- dashboard loading → loaded
- strategies list with toggle mutation
- billing plan selection flows
- settings security flows
- admin system health refresh

### 4. End-to-End Tests
Focus on highest-risk cross-stack user journeys:
- login and protected route access
- create strategy and view detail
- subscribe/upgrade handoff to billing
- admin user role gating
- WS-driven opportunities and recent trade updates

---

## Global Testing Rules

1. Prefer assertions on visible behavior and accessible roles over internals.
2. Reset all Zustand stores between tests.
3. Use deterministic dates and timezone control in tests involving `TimeAgo`, charts, and billing periods.
4. Never rely on live network or actual chain connections.
5. Avoid large brittle snapshots; if used, limit them to tiny serialized helper outputs.
6. For real-time tests, explicitly simulate connection states and event sequences.

---

## Core Test Utilities

### `renderWithProviders`
Must provide:
- memory router with initial entries
- fresh query client
- store reset hooks
- auth context/store seeding
- optional preloaded query data
- optional feature flag overrides

### `mockApiError`
Helper for normalized API errors by code/status, enabling form and page error assertions.

### `emitWsEvent`
Helper that simulates validated WebSocket payloads and triggers the same handler path used in production.

### Fixture Builders
Required builders:
- `buildUser(overrides)`
- `buildStrategy(overrides)`
- `buildTrade(overrides)`
- `buildOpportunity(overrides)`
- `buildSubscription(overrides)`
- `buildAlert(overrides)`
- `buildSystemHealth(overrides)`

Use builders, not giant inline objects, so tests stay readable.

---

## Unit Test Inventory

### Formatting Helpers

#### Profit formatting
Cases:
- positive USD value renders with `+` and green class token mapping
- negative USD value renders with `-` and red class token mapping
- zero renders neutral formatting
- very large values use commas/abbreviated format if supported

#### Address formatting
Cases:
- truncates `0x1234567890abcdef...` into expected compact string
- full address remains in tooltip or copy payload
- invalid/short address handled gracefully

#### Time formatting
Cases:
- recent timestamps render seconds/minutes properly
- future timestamps for countdowns do not render nonsensical negatives
- UTC/local preference affects display formatter where required

### Query Key Builders
Cases:
- identical filter objects produce stable keys
- changing one filter field changes key
- undefined optional filters normalize consistently

### Access Control Helpers
Cases:
- free user denied executor routes
- trader user allowed prediction UI but denied execution actions
- admin user sees admin sections
- institutional user gets API key entitlements as expected

### WebSocket Reducers / Cache Patch Helpers
Cases:
- opportunity insert deduplicates by route ID
- trade update patches existing row rather than duplicating
- expired opportunity prunes from list
- out-of-order message with older timestamp ignored if current item is newer

---

## Component Test Inventory

### `StatCard`
Test:
- label/value render correctly
- trend indicator shows arrow direction and percentage
- loading skeleton variant appears when loading prop true
- negative trend color not applied to inherently positive metrics like success rate unless explicitly configured

### `DataTable`
Test:
- headers render
- sorting callback fires
- pagination controls call page change
- empty state renders CTA when no rows
- error state renders retry action
- loading state uses skeleton rows and suppresses stale body content when appropriate

### `ProfitDisplay`
Test:
- positive/negative/zero styling and text
- optional currency symbol
- large decimal rounding

### `RoutePath`
Test:
- renders all hops and DEX badges
- compact mode truncates visually but retains accessible labels
- handles 2-hop and 6-hop routes

### `TxStatusBadge`
Test:
- each status maps to correct text/icon/style
- unknown status falls back to neutral badge and logging path if designed

### `AddressDisplay`
Test:
- copy button writes full address to clipboard
- explorer link URL built correctly from chain ID
- keyboard interaction works

### `ConfirmDialog`
Test:
- opens with message
- confirm calls callback
- cancel closes without callback
- Escape key closes when allowed

### `FAQAccordion`
Test:
- item expands/collapses by click and keyboard
- URL hash targeting opens matching item

---

## Auth Page Tests

### Login Page
Cases:
1. renders email/password fields and submit button
2. invalid form blocks submit and shows field errors
3. successful login stores auth state and redirects to dashboard
4. API response requiring 2FA swaps to TOTP input flow
5. invalid credentials show toast error
6. locked account shows account lock message with unlock hint if API provides it
7. loading state disables inputs and button

### Register Page
Cases:
1. password strength indicator updates as criteria are met
2. mismatched confirmation shows validation error
3. successful registration redirects to login with verification banner
4. existing email error displays backend message

### Forgot/Reset Password
Cases:
- forgot password shows generic success regardless of email existence
- reset page validates token-present route
- reset success redirects correctly
- expired token shows error and link to request another reset

### Verify Email
Cases:
- loading state first
- success card on valid token
- invalid token shows error state

---

## Core Product Page Tests

### Dashboard
Cases:
1. initial skeletons render while dashboard query loads
2. loaded data shows stat cards, chart, recent trades table
3. empty state appears when no trades or strategies exist
4. API failure shows retry UI
5. incoming WS trade event prepends a new recent trade row
6. disconnected WS shows subtle banner without blanking existing data
7. period selector refetches analytics and updates chart

### Strategies List
Cases:
1. list renders rows and new strategy CTA
2. empty state CTA routes to create page
3. toggle active/inactive calls correct mutation and updates row state
4. delete action requires confirm dialog
5. delete failure rolls back optimistic removal if used

### Strategy Create/Edit
Cases:
1. full form renders with defaults
2. chain change updates available DEX options
3. invalid numeric inputs show validation messages
4. successful create redirects to detail page
5. edit mode prepopulates existing strategy data
6. unsaved draft warning appears on navigation away if implemented

### Strategy Detail
Cases:
- displays strategy summary and trade history
- activate/deactivate confirmation works
- strategy-specific chart loads
- missing strategy ID returns not-found UI

### Trades List
Cases:
- filters update query parameters
- pagination keeps prior page visible until next page loads
- sorting by net profit triggers correct request state
- explorer link opens expected URL
- empty state copy correct when no trades match filters

### Trade Detail
Cases:
- route detail cards render hop data
- summary numbers include flash loan fee, gas, net profit
- simulated vs actual comparison visible when data present
- not-found response shows not-found state

### Opportunities Page
Cases:
1. REST snapshot bootstraps page
2. WS opportunity event inserts live card
3. expired opportunity disappears after timer or event
4. chain selector swaps cache key and list
5. empty state shows scanning message
6. high-frequency event burst does not duplicate cards

### Pools and Analytics Pages
Cases:
- filters drive query state
- tab switches fetch only needed analytics data
- competitor table renders and sorts
- gas analytics chart and highlight copy appear when data exists

---

## Settings, Billing, and Admin Page Tests

### Settings Page

#### Profile tab
- existing profile data preloads
- successful save shows toast and updated name
- validation errors inline

#### Security tab
- change password happy path
- wrong current password error
- enable 2FA opens QR modal and verify step
- disable 2FA requires code
- active sessions list renders and revoke action updates list

#### Notifications tab
- alerts list renders
- add alert modal validates required fields
- toggle active state updates row
- delete alert requires confirmation

### Billing Page
Cases:
1. free plan view shows upgrade CTAs
2. active paid plan shows current plan status and manage billing button
3. plan comparison matrix renders expected feature text
4. selecting tier triggers checkout mutation and redirect handoff
5. `?success=true` shows success toast
6. `?cancelled=true` shows cancel message
7. Stripe unavailable state disables checkout and shows fallback note

### API Keys Page
Cases:
- list existing keys
- create key flow shows one-time secret result
- copy key action copies full key
- revoke key requires confirm dialog
- revoked key disappears or updates after mutation

### Admin Users Page
Cases:
- non-admin access redirected or blocked with forbidden page
- admin list loads and filters by role/search
- lock/unlock mutation updates row
- impersonate control visible only when allowed by product rules

### Admin System Page
Cases:
- health cards render service states
- auto-refresh updates card status
- pause all execution requires confirmation
- config row save shows success and inline loading
- backend health error shows panel-level error, not whole app crash

---

## Marketing Page Tests

Even public pages need coverage because they drive acquisition.

### Landing Page
Cases:
- hero renders main CTA and secondary CTA
- feature sections and trust band appear
- screenshot tabs switch visible panel content
- CTA links route correctly

### Pricing Page
Cases:
- all tier cards render
- logged-out CTA routes to register with plan param
- authenticated current plan shows disabled current-plan button
- institutional CTA routes to contact sales

### FAQ / Contact Sales / Docs Preview
Cases:
- accordion expands and supports hash open
- contact sales validates fields and success state replaces form
- docs preview sample code blocks render and CTA present

### Legal Pages
Cases:
- terms/privacy/risk routes render headings and core sections
- footer links navigate correctly

---

## Real-Time Behavior Tests

These are high-value because FlashRoute depends on live updates.

### Connection Banner
Cases:
- disconnect after connected state shows banner
- reconnect hides banner and refreshes volatile queries
- repeated reconnect attempts do not stack banners/toasts

### Opportunities Feed Event Sequence
Test event order:
1. snapshot returns 3 opportunities
2. WS adds new opportunity
3. WS updates existing opportunity estimated profit
4. WS expires one opportunity
5. list count remains correct and IDs unique

### Recent Trade Live Insert
Cases:
- new trade appears at top of dashboard and trades first page if filters match
- non-matching trade for another chain does not appear in filtered table
- sound alert only triggers when user preference enabled

### Admin Health Stream
Cases:
- worker transitions from healthy to degraded update indicator color/text
- older event cannot overwrite newer health timestamp

---

## End-to-End Coverage

### E2E 1: Standard Login and Dashboard Load
Steps:
1. visit protected route `/dashboard`
2. redirect to login
3. enter credentials
4. land on dashboard
5. verify stat cards and recent trades section visible

### E2E 2: Create Strategy
Steps:
1. login as executor user
2. open `/strategies/new`
3. fill required fields
4. submit
5. land on new strategy detail page with saved values

### E2E 3: Upgrade Plan
Steps:
1. login as free user
2. open pricing/billing page
3. click Trader tier
4. verify checkout session request made and external redirect initiated

### E2E 4: Admin Guard
Steps:
1. login as non-admin
2. attempt `/admin/system`
3. verify forbidden redirect/state
4. login as admin
5. verify page loads health cards

### E2E 5: Live Opportunities
Steps:
1. login
2. open opportunities page
3. simulate WS messages
4. verify cards appear/update/expire without full reload

---

## Non-Functional Frontend Test Areas

### Accessibility Smoke Tests
At minimum automate:
- pages have one `h1`
- buttons/inputs have accessible names
- dialogs trap focus
- keyboard nav works for sidebar, menus, accordions, modals
- color-only indicators supplemented by text/icon

### Visual Regression
Optional but useful for:
- dashboard top section
- pricing cards
- opportunities cards
- billing matrix
- admin health grid

If implemented, keep snapshots narrow and deterministic.

### Performance-Focused Checks
Not full benchmark tests, but add guardrails:
- opportunity burst event handling does not grow list past cap
- page avoids duplicate API calls on mount under strict mode conditions
- disconnected WS fallback polling does not refetch more often than configured

---

## CI Expectations

Frontend tests in CI should run in layers:
1. lint + typecheck
2. Vitest unit/component/integration
3. Playwright smoke suite on critical paths

Block merge/deploy if:
- auth tests fail
- billing routing tests fail
- admin guard tests fail
- live opportunity event tests fail

---

## Minimum Coverage Targets

Coverage numbers are not the goal, but they are useful guardrails.

Suggested thresholds:
- utility/state modules: 85%+
- shared components: 80%+
- page route modules: 70%+
- overall frontend: 75%+ statements/branches with special attention to auth, billing, and live update paths

Low-value generated types and trivial barrel files should be excluded.

---

## Implementation Notes for Coding Agent

- Write tests as the UI is built, not after all pages exist
- Build test helpers first; they will save massive time later
- Keep API mocks close to contract definitions from `03-API-SPECIFICATION.md`
- Explicitly test loading, error, empty, and loaded states for every major page
- For high-risk pages, prefer one strong integration test over ten shallow render tests
- Treat WebSocket and auth flows as first-class regression surfaces, not optional extras
