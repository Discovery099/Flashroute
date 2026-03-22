# Frontend Design System: FlashRoute

---

## Overview

Component library and interaction system for the FlashRoute dashboard. The product UI is intentionally dark, data-dense, and optimized for professional crypto traders and operators who spend hours watching live market state. The design goal is not consumer-app friendliness; it is fast scanning, low cognitive overhead, strong numerical hierarchy, and clear handling of high-risk actions such as strategy activation, trade review, billing upgrades, API key creation, and admin maintenance operations.

The design system must be implemented as a reusable UI layer that sits above Tailwind tokens and below feature pages. All page specifications in `15-FRONTEND-PAGES-AUTH.md`, `16-FRONTEND-PAGES-CORE.md`, and `17-FRONTEND-PAGES-ADMIN.md` depend on this file. A coding agent should build the full component library first, then assemble pages using these primitives rather than inventing page-specific widgets.

The frontend stack is React 18 + TypeScript 5 + Vite + Tailwind CSS + React Router + TanStack Query v5 + React Hook Form + Zod + Zustand + Recharts + Lucide React. Component APIs should be strongly typed, visually consistent, and designed to support loading, empty, error, success, disabled, and permission-restricted states without ad hoc styling.

**Estimated LOC:** 5,000-7,000

---

## Design Principles

### 1. Data first
Every page should foreground profit, execution status, latency, and system health. Decorative UI is minimized. Cards, tables, filters, charts, and badges must visually support fast decision-making.

### 2. Live system clarity
The product receives websocket updates and periodic refetches. Components must distinguish:
- initial load
- background refresh
- stale-but-visible data
- disconnected live feed
- confirmed real-time connection recovery

A user should never confuse “no opportunities found” with “socket disconnected” or “query failed.”

### 3. Trading-safe interactions
Potentially destructive or financially meaningful actions require confirmation and contextual warnings:
- delete strategy
- deactivate active strategy
- revoke API key
- disable 2FA
- impersonate user
- pause system execution
- force resync or sweep jobs

### 4. Numeric readability
All prices, profits, percentages, gas values, timestamps, hashes, block numbers, and token amounts should use stable formatting rules. Use monospace for addresses, tx hashes, block heights, and machine identifiers. Align numeric columns right in tables.

### 5. Responsive but desktop-prioritized
Most customers will use desktop dashboards. Mobile is supported, but not by shrinking everything indiscriminately. Tables collapse into cards or horizontally scroll with pinned identifiers. Strategy editing and analytics remain usable down to 320px width.

### 6. Accessible under dark theme
Dark interfaces often fail contrast requirements. All tokens and component states must maintain readable contrast. Keyboard navigation, focus indicators, ARIA labels, and explicit text state labels are mandatory.

---

## Design Tokens

### Colors (Tailwind custom theme)

```txt
Background:      bg-gray-950 (#0a0a0f)      — main app background
Surface:         bg-gray-900 (#111118)      — standard card/panel
Surface-hover:   bg-gray-800 (#1a1a24)      — hover state on panels/rows
Surface-elevated:bg-[#151521]               — modal/dropdown elevated surface
Border:          border-gray-700 (#2a2a3a)  — default borders
Border-strong:   border-gray-600 (#3a3a4d)  — emphasized boundaries
Text-primary:    text-gray-100 (#f0f0f5)    — headings/primary values
Text-secondary:  text-gray-400 (#9090a0)    — labels/metadata
Text-muted:      text-gray-500 (#606070)    — placeholders/disabled
Divider:         bg-gray-800                — internal separators

Profit-positive: text-emerald-400 / bg-emerald-500/10 / border-emerald-500/30
Loss-negative:   text-red-400     / bg-red-500/10     / border-red-500/30
Warning:         text-amber-400   / bg-amber-500/10   / border-amber-500/30
Info:            text-blue-400    / bg-blue-500/10    / border-blue-500/30
Accent:          text-violet-400  / bg-violet-500/10  / border-violet-500/30
Success-bg:      bg-emerald-950/40
Danger-bg:       bg-red-950/40
Overlay:         bg-black/60      — modal/sheet/scrim backdrop
```

### Semantic application colors
Do not use raw color names at call sites when semantics are known. Map meaning to tokens:
- profitable metric -> `positive`
- failed/reverted trade -> `negative`
- pending submission / stale market data -> `warning`
- informational hint / websocket status / external links -> `info`
- primary CTA / selected tab / focus -> `accent`

### Typography
- Primary font: Inter
- Monospace font: JetBrains Mono
- Weights: 400 body, 500 labels, 600 section titles, 700 page titles/key metrics

Type scale:
- `text-xs` 12px — badges, captions, secondary metadata
- `text-sm` 14px — labels, filters, compact table values
- `text-base` 16px — standard body/form text
- `text-lg` 18px — card subtitles/important inline metrics
- `text-xl` 20px — section headings
- `text-2xl` 24px — page title / major chart title
- `text-3xl` 30px — top KPI value only

Numeric rules:
- Profit/gas/currency values: JetBrains Mono, tabular figures enabled
- Percentages: one or two decimal places depending on domain
- Timestamps: human-readable default with exact tooltip
- Addresses and hashes: monospace + truncation + copy action

### Spacing
Base spacing scale follows Tailwind. Use consistently:
- 2 / 4 / 6 for internal element spacing
- 6 / 8 for card padding
- 8 / 10 / 12 for section spacing
- 16+ for page section separation

### Radius and shadows
- Inputs/buttons/cards: `rounded-xl`
- Pills/badges: `rounded-full`
- Modals: `rounded-2xl`
- Elevated shadow: subtle only; rely on border and contrast more than glow

### Motion
Animations should be short and functional:
- hover transitions: 120-180ms
- toasts: 150ms in, 150ms out
- modal open/close: 180-220ms
- live pulse dot: 2s loop
- highlight newly inserted live rows/cards for 2.5s using low-opacity accent flash

Respect `prefers-reduced-motion`; disable nonessential shimmer/pulse/slide effects.

---

## Layout System

### Breakpoints
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

### AppShell
**Purpose:** Main authenticated scaffold with sidebar, header, live system affordances, content padding, and responsive navigation behavior.

**Props:**
```ts
{
  children: ReactNode;
  sidebarCollapsed?: boolean;
  onSidebarToggle?: () => void;
  currentRoute: string;
  user: UserDTO;
  activeChainId?: number | 'all';
  websocketConnected: boolean;
  environmentBadge?: 'production' | 'staging' | 'development';
}
```

**Behavior:**
- Desktop (`lg+`): persistent sidebar on left, header fixed at top of content region.
- Tablet (`md` to `lg`): sidebar may collapse to icon rail while preserving tooltip labels.
- Mobile (`<md`): sidebar becomes slide-over drawer, opened by hamburger in header.
- If websocket disconnects, header shows yellow connection banner beneath top bar without shifting page title layout more than one row.
- Content area max width should remain fluid for tables; analytics pages may opt into full-width charts.

### Sidebar
Sections:
- Dashboard
- Strategies
- Trades
- Opportunities
- Pools
- Analytics
- Settings
- Billing
- API Keys
- Admin (only if role is `admin`)

**Item state rules:**
- active route: accent background + left border or inset ring
- hover: surface-hover
- disabled due to plan: muted text + lock icon + upgrade tooltip
- hidden due to RBAC: not rendered at all

### Header
Must include:
- chain selector (global context; pages can override)
- websocket/live indicator
- notification bell with unread count badge
- wallet status if connected to on-chain helper wallet
- user menu with profile, billing, logout

**Sticky behavior:** header stays visible during page scroll for trading pages. Use translucent background with backdrop blur and bottom border.

### PageContainer
Standard wrapper for title, subtitle, breadcrumb, primary actions, secondary actions, and optional filter bar.

**Required behavior:**
- stack title/subtitle above actions on mobile
- allow action buttons to wrap across lines instead of overflow clipping
- support `stickyFilters` on dense table pages

### Card
Variants:
- default
- interactive
- loading
- error
- success
- warning

Cards must support:
- title + subtitle + right-aligned action area
- content padding presets (`compact`, `default`, `spacious`)
- optional footer separated by top border
- internal `aria-busy` during loading state

---

## Data Display Components

### 1. DataTable
Generic typed table used for strategies, trades, pools, API keys, users, competitors, and alerts.

**Props:**
```ts
{
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
  sort?: { field: string; direction: 'asc' | 'desc' };
  onSort?: (field: string) => void;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  dense?: boolean;
  pinnedColumns?: string[];
}
```

**State handling:**
- Loading: show header skeleton + 5-10 row skeletons, preserve table outline.
- Background refresh: keep rows visible, show subtle top progress bar/spinner in header.
- Error with no data: render `ErrorState` in table body area.
- Error with stale data: keep prior data visible and show inline warning banner with retry.
- Empty: render `EmptyState` with optional CTA.

**Responsive behavior:**
- `xl+`: full table.
- `md-lg`: horizontal scroll container with sticky first column for identifier.
- `<md`: allow page-level alternative card list for selected tables (trades, strategies, API keys) instead of trying to force all columns.

**Accessibility:** sortable headers are buttons with `aria-sort`.

### 2. StatCard
Display a primary metric with optional delta, sparkline placeholder slot, and explanatory footnote.

Fields:
- label
- value
- delta absolute or percentage
- comparison label (“vs prior 30d”)
- icon
- status tone (`positive`, `negative`, `neutral`, `warning`)
- optional loading shimmer

**Usage rules:** value is prominent; label secondary. Delta should include explicit sign and arrow icon.

### 3. ProfitDisplay
Formatting rules:
- USD values use `$12,345.67`
- positive values display `+` sign
- zero displays `$0.00` in neutral gray
- optional compact form (`$12.3k`) for cards only, never in trade detail or billing
- negative zero should normalize to zero

### 4. AddressDisplay
Must include:
- truncation logic with responsive width
- copy feedback toast or inline icon transition
- explorer link mapped by chainId
- optional label (“wallet”, “pool”, “competitor”)
- `title` attribute with full address

### 5. TokenPairDisplay
Supports token missing-logo fallback to colored initials circle. If token metadata is missing symbol, show shortened address.

### 6. RoutePath
Critical arbitrage visualization component.

**Rendering rules:**
- each hop shows token in -> DEX badge -> token out
- on compact mode, collapse intermediate hops with “+2 hops” tooltip when route > 3 hops
- on expanded mode, show pool fee tier and pool address link under each hop
- show arrow direction consistent left-to-right on desktop; stacked vertical on mobile

### 7. TxStatusBadge
Mapping:
- `pending`: amber dot + “Pending”
- `submitted`: blue dot + “Submitted”
- `confirmed`: emerald dot + “Confirmed”
- `reverted`: red dot + “Reverted”
- `failed`: gray dot + “Failed”
- optional `simulated_only`: violet dot + “Simulated” if page needs it

### 8. ChainBadge
Each badge includes chain color, icon, and accessible text. Unknown chain falls back to generic globe icon + `Chain {id}`.

### 9. TimeAgo
- recalculates every 15s for timestamps < 10m old
- every 60s for timestamps < 24h
- static beyond 24h
- exact ISO/local formatted timestamp appears in tooltip

### 10. LiveIndicator
States:
- connected -> green pulsing dot + “Live”
- reconnecting -> amber pulsing dot + “Reconnecting”
- disconnected -> red static dot + “Offline”
- stale polling fallback -> gray dot + “Polling only”

---

## Chart Components

All charts should share a consistent theme wrapper:
- dark grid lines (`stroke-gray-800`)
- axis labels gray-400
- tooltip surface elevated with border
- legend optional, hidden on small screens if redundant
- empty chart area uses same card height with inline explanation

### ProfitChart
- supports cumulative and daily mode
- area under line uses low-opacity emerald fill
- negative profit sections may tint red if dataset crosses below zero
- tooltip shows date, gross profit, gas cost, net profit where data available
- x-axis label density must reduce on mobile

### GasChart
- bar color shifts from blue to amber when average base fee exceeds configured threshold
- optional reference line for configured max gas price

### SuccessRateChart
- donut chart center label shows success percentage
- legend includes counts and percentages
- if all counts zero, show empty placeholder instead of misleading 100%

### VolumeChart
- supports stacked volume by chain if page requests it
- tooltip must display exact USD value with commas

---

## Form Components

All form controls must integrate cleanly with React Hook Form and Zod. Provide controlled and uncontrolled wrappers where useful.

### Input
Supports types:
- text
- email
- password
- number
- search
- url

Features:
- label
- description
- placeholder
- prefix/suffix adornments (e.g. `$`, `%`, `ms`, `gwei`)
- error text
- success text
- disabled/readOnly
- optional clear button for search inputs

**Validation display rules:**
- show inline error after blur or submit, not on every keystroke by default
- number inputs sanitize invalid characters but do not auto-coerce silently on blur if doing so changes economic meaning; show explicit validation instead

### Select
Can render as native select on mobile if custom listbox would be awkward. On desktop use custom menu with keyboard navigation and search for long lists.

### Toggle
Used for strategy activation, feature flags, notifications, and Flashbots usage. If toggling causes a network mutation, component supports optimistic state with rollback on failure.

### Slider
Used for max hops, risk buffer, thresholds. Always show current value adjacent to label and enforce min/max in schema as well as UI.

### TokenSelect
- searchable by symbol, name, address
- supports async loading for large token sets
- displays token logo, symbol, and shortened address
- selected tokens become chips
- duplicates disallowed

### DexCheckboxGroup
- grid layout with logos and names
- disabled items show reason tooltip if unsupported on selected chain
- group-level validation: at least one DEX must be selected for a strategy

### Field-level validation conventions
- required: message below control in red
- warnings (non-blocking): amber helper text below control
- server-side validation errors should map to specific fields when response returns `fieldErrors`
- unknown server errors surface in form-level error alert at top of card

---

## Action Components

### Button
Variants:
- `primary` — accent background, white text
- `secondary` — surface background, border, neutral text
- `danger` — red background or outlined depending on emphasis
- `ghost` — no background until hover
- `success` — limited use for positive confirmations

Sizes:
- `sm` for table actions
- `md` default
- `lg` hero CTA on auth/billing pages

Behavior:
- loading state replaces leading icon with spinner, keeps width stable
- disabled state must clearly differ from loading
- destructive actions require explicit labels, never ambiguous “OK” buttons

### IconButton
Must always have tooltip and `aria-label`. Hit target minimum 36x36.

### CopyButton
- copies text to clipboard
- success icon state lasts 2 seconds
- on clipboard API failure, open fallback modal with selectable text

### ConfirmDialog
Must support severity-specific copy.

Structure:
- title
- descriptive message
- optional consequences list
- confirm and cancel buttons
- optional typed confirmation for critical admin actions (“PAUSE”)

### Toast
Global toast provider with queue limit of 5. Types:
- success
- error
- warning
- info

Rules:
- success auto-dismiss 4s
- info/warning 6s
- error persists until dismissed if blocking a workflow
- duplicate toasts within 2 seconds should collapse into one instance when same key/message

---

## Feedback Components

### LoadingSkeleton
Variants:
- text lines
- stat card
- table row
- form block
- chart block

Skeletons should resemble final layout closely enough to reduce layout shift.

### EmptyState
Includes icon, title, description, and optional CTA. Copy should be domain-specific, not generic “No data found.” For example: “No strategies configured yet. Create a strategy to begin monitoring flash-loan opportunities on Ethereum or Arbitrum.”

### ErrorState
Can be inline or full-panel. Supports:
- short message
- optional retry
- optional technical detail disclosure accordion in admin pages
- optional support link or docs link

### Badge
Variants:
- default
- success
- warning
- error
- info
- plan tier
- role

### Tooltip
Delay 250ms open, 100ms close. Must render in portal to avoid clipping in tables/modals.

---

## Global UX Patterns

### Query state pattern
For all TanStack Query pages and cards:
1. First load -> skeleton
2. Success with data -> render data
3. Success with empty collection -> empty state
4. Error with no prior data -> full error state
5. Error with prior data -> stale data + warning banner + retry

### Mutation state pattern
For POST/PATCH/DELETE actions:
- disable only the affected action, not entire page unless necessary
- optimistic updates allowed for reversible toggles only
- rollback on error with toast
- confirm success with concise toast and, if relevant, inline state badge update

### Websocket/live state pattern
When websocket disconnects:
- keep last known data visible
- show live indicator as disconnected
- show banner “Live updates paused. Falling back to background refresh.”
- trigger polling fallback where specified by page

### Table filtering pattern
Filter bars should support:
- desktop: horizontal controls with wrap
- mobile: “Filters” sheet with applied filter count badge
- clear-all action
- persisted query params in URL for reload/share behavior on list pages

### Destructive action pattern
Delete/revoke/pause actions must:
- have explicit subject in dialog title
- explain irreversible consequences
- show mutation progress state
- lock confirm button during request

---

## Accessibility

All interactive components include:
- semantic HTML where possible before custom roles
- `aria-label` for icon-only controls
- `aria-describedby` linking inputs to helper/error text
- keyboard support: Tab, Shift+Tab, Enter, Space, Escape
- visible `focus-visible` ring (`ring-2 ring-violet-500 ring-offset-2 ring-offset-gray-950`)
- modals trap focus and restore it on close
- drawers close on Escape and backdrop click
- toasts announced through an ARIA live region
- charts include accessible textual summaries or data tables for screen readers where practical
- color is never the sole status indicator; pair with text/icon

Contrast targets:
- body text minimum WCAG AA on dark surfaces
- secondary text still readable; avoid gray-on-gray too low contrast
- disabled text may be muted but must remain legible

---

## Implementation Notes for the Coding Agent

1. Build a `ui/` component layer first.
2. Centralize formatting helpers in `lib/formatters.ts`:
   - currency
   - percentage
   - big numbers
   - relative time
   - addresses and hashes
3. Centralize token-to-chain explorer mappings in `lib/chains.ts`.
4. Use Tailwind theme extension rather than hardcoding colors repeatedly.
5. Export components through a barrel file grouped by `layout`, `data-display`, `forms`, `feedback`, and `charts`.
6. Create Storybook-style demo route or internal style guide page if useful, but do not make that a user-facing page requirement.
7. Every component with async or stateful behavior should have unit tests for rendering and interaction states.
8. Components used in tables and real-time dashboards must avoid expensive rerenders; memoize where useful.
9. Preserve consistent loading heights between states to minimize layout shift.
10. All page specs should use these components rather than page-specific one-offs unless a page explicitly requires a custom visualization.
