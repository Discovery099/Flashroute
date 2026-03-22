# Frontend Pages — Settings, Billing & Admin: FlashRoute

---

## Overview

These pages cover account settings, security, notifications, billing, API keys, and admin-only operational controls. Although grouped together here, the implementation should treat them as distinct product surfaces with different risk levels:
- Settings: self-service account management
- Billing: subscription and plan transitions
- API Keys: sensitive credential management
- Admin: privileged operational tooling with RBAC, auditability, and destructive-action safeguards

All pages use the authenticated `AppShell` and shared design-system components. Sensitive mutations require clear success/error feedback and confirmation patterns.

**Estimated LOC:** 3,000-4,000

---

## Page: Settings (`/settings`)

### Tabs
- Profile
- Security
- Notifications

Persist tab in search param (`?tab=security`) so deep links work.

### Profile tab
**Fields:**
- Name
- Email (read-only)
- Timezone (IANA select)
- Default chain selector if product supports saved preference

**API:**
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`

**Validation:**
- name 2-100 chars
- timezone required and must match supported options

**Behavior:**
- save button disabled until form dirty and valid
- success toast `Profile updated`
- email row shows verified/unverified badge; if unverified, render resend verification action

### Security tab
#### Change password
Fields: current password, new password, confirm password.
Validation mirrors auth password rules.
API: `PUT /api/v1/users/me/password`

#### Two-factor authentication
States:
- disabled -> `Enable 2FA`
- enrolling -> QR code + secret fallback + verification code field
- enabled -> status badge, backup codes link/regenerate, disable button

API suggestions:
- `POST /api/v1/users/me/2fa/setup`
- `POST /api/v1/users/me/2fa/verify`
- `DELETE /api/v1/users/me/2fa`
- Backup codes are returned during the successful verify step and are not regenerated through a separate MVP endpoint

Disable action requires confirm dialog + TOTP code input.

#### Active sessions
List current refresh-token sessions with:
- created time
- last seen
- IP address
- user agent/device summary
- current session badge
- revoke button

API:
- Session-device management is out of scope for the MVP API surface. The Security tab should clearly show password-change and 2FA controls first, with multi-session revocation reserved for a later API expansion.

### Notifications tab
User manages alert rules.
Fields per alert:
- type
- chain
- delivery channel
- threshold
- cooldown
- active toggle

API:
- `GET /api/v1/alerts`
- `POST /api/v1/alerts`
- `PATCH /api/v1/alerts/:id`
- `DELETE /api/v1/alerts/:id`

Use modal or slide-over form. Validation should enforce positive thresholds and cooldown minimums.

### Settings page states
- loading: skeleton tabs and form blocks
- error: inline retry panel per tab
- partial stale: show current values plus warning banner if a save failed to persist

---

## Page: Billing (`/billing`)

### Purpose
Display current subscription, entitlements, usage limits if any, and allow upgrade/downgrade/portal actions.

### API
- `GET /api/v1/billing/subscription`
- `POST /api/v1/billing/checkout`
- `POST /api/v1/billing/portal`

### Sections
#### 1. Current plan card
Show:
- plan name
- status badge (`active`, `trialing`, `past_due`, `canceled`, `incomplete`)
- current period start/end
- renewal/cancelation message
- quota summary (alerts/day, strategies allowed, API keys allowed)

If free plan:
- show feature limitations and upgrade CTAs

If paid:
- `Manage Billing` opens Stripe customer portal

#### 2. Plan comparison
Tiers:
- Monitor (Free)
- Trader ($99/mo)
- Executor ($299/mo)
- Institutional ($999/mo)

Each row must clearly distinguish included vs excluded features, numeric limits, and current-plan highlighting.

#### 3. Checkout result handling
Read URL params:
- `success=true` -> success toast/banner
- `cancelled=true` -> info toast/banner

### Behavior details
- if current subscription is `past_due`, show prominent warning and CTA to update billing
- disable choosing the already-active plan; replace CTA with `Current Plan`
- if downgrade has delayed effect at period end, explain this in helper text

### Responsive behavior
- plan comparison becomes stacked pricing cards on mobile instead of wide table

---

## Page: API Keys (`/settings/api-keys`)

### Purpose
Allow customers to create and revoke API keys safely.

### API
- `GET /api/v1/api-keys`
- `POST /api/v1/api-keys`
- `DELETE /api/v1/api-keys/:id`

### List table
Columns:
- Name
- Key Prefix
- Permissions
- Last Used
- Created
- Actions

### Create key flow
Open modal with:
- Name
- Permission checkboxes/scopes
- optional expiration date if supported

Validation:
- name required 2-50 chars
- at least one permission selected

On create success:
- close create form
- open one-time reveal modal with full key in monospace copyable field
- warning text: `Save this key now. You will not be able to view it again.`
- copy button + acknowledge button

### Revoke flow
Requires confirm dialog. If key is used by active integrations, warn that requests signed with it will fail immediately.

### Empty state
`No API keys created yet.` CTA `Create API Key`.

---

## Admin Page: Users (`/admin/users`) [admin only]

### Purpose
Search, review, and manage customer accounts.

### API
`GET /api/v1/admin/users?page=&search=&role=&locked=`
Mutations:
- `PATCH /api/v1/admin/users/:id` for role changes, lock/unlock state, and account lifecycle changes
- `POST /api/v1/admin/users/:id/impersonate`

### Filters
- role select
- search by name/email
- locked toggle
- subscription status filter if available

### Table columns
- name
- email
- role
- subscription status
- login count
- created date
- last seen
- actions

### Action safeguards
- lock/unlock requires confirm dialog with reason field if backend accepts audit notes
- impersonate should show strong warning banner and open a new session/window context if architecture supports it
- admin cannot demote last remaining super-admin; disable action if backend indicates protected user

### States
- empty search results should differentiate from no users in system
- row-level mutation loading should not freeze the entire table

---

## Admin Page: System (`/admin/system`) [admin only]

### Purpose
Operational health and emergency controls for the platform.

### API
- `GET /api/v1/admin/system/health`
- `GET /api/v1/admin/system/config`
- `PATCH /api/v1/admin/system/config` for runtime configuration changes
- Operational actions in the MVP are expressed through configuration mutations and worker-controlled command flows rather than separate `/actions/*` endpoints

### Sections
#### 1. Health status grid
Cards for:
- database
- redis
- chain RPC nodes per chain
- websocket gateway
- workers (scanner, executor, analytics, alerts)

Each card shows:
- status color/icon
- latency or freshness metric
- last checked time
- optional detail string

Auto-refresh every 30 seconds with manual refresh button.

#### 2. System config editor
Table of runtime config keys with current values, descriptions, last updated metadata, and inline save action.

Rules:
- only allow editing whitelisted keys
- parse numeric/boolean values according to schema
- invalid config returns inline row error
- show warning that changes propagate immediately via Redis/pub-sub

#### 3. Quick actions
- Pause all execution
- Resume execution
- Force pool resync
- Force profit sweep

Each action requires explicit confirmation; `Pause all execution` should be highest-severity danger action. Support optional typed confirmation for pause/resume if desired.

### Operational UX requirements
- render active maintenance mode banner at top if system paused
- show action audit timestamp/result after each successful admin action
- keep health data visible during refreshes; do not blank grid on every poll
- if one subsystem errors, isolate the error to that card rather than failing the page wholesale

---

## RBAC and Navigation Rules

- Non-admin users must never see admin nav items or route content.
- If a non-admin manually navigates to `/admin/*`, show 403 page and offer return to dashboard.
- Billing and API Keys may also be plan-gated; if the plan disallows API usage, still show API Keys page with upgrade explanation rather than hard 404.

---

## Responsive and Validation Details

### Settings responsiveness
- desktop: tabs horizontal at top with content card below
- tablet/mobile: tabs may collapse into segmented control or select menu if labels wrap badly
- active sessions list should become stacked cards on mobile with revoke button pinned to bottom-right of each card

### Settings validation rules
- password change requires current password and matching new/confirm passwords
- block reuse of current password if backend returns corresponding error code
- 2FA verification field must accept only six digits
- notification threshold and cooldown values must reject zero/negative numbers
- when deleting an alert rule, require confirmation if it is currently active

### Billing display rules
- show plan price monthly with yearly-equivalent note only if yearly billing exists
- highlight recommended plan visually but never override current-plan highlight
- if portal creation fails, keep user on page and show inline error near Manage Billing button

### API key presentation rules
- key prefix rendered in monospace and copyable
- permission badges should wrap cleanly on narrow screens
- one-time reveal modal must require explicit acknowledgement before close if the key has not been copied yet
- if create-key mutation returns rate-limit or plan-limit error, show upgrade CTA where relevant

### Admin safety copy
Admin surfaces should explicitly explain consequences of actions:
- pause execution: `Prevents any new arbitrage executions from being submitted until resumed.`
- force pool resync: `Queues immediate metadata and reserve refresh jobs across monitored pools.`
- profit sweep: `Triggers treasury settlement workflow for completed profitable executions.`

---

## Auditability and Feedback Requirements

### Mutation feedback
For all settings, billing, API key, and admin mutations:
- show button-level loading state
- show success toast and, where useful, inline updated badge/timestamp
- surface backend-provided audit metadata such as `updatedBy`, `updatedAt`, or action result message

### Audit-oriented UI in admin
Where backend returns audit fields, display:
- last config change time
- actor email or system user
- last pause/resume event
- most recent resync/sweep trigger status

### Partial failure behavior
Admin system pages should not collapse into a single fatal error because one subsystem is unreachable. Example:
- database card healthy
- redis card timeout error
- chain RPC card degraded

Render per-card state with overall page warning banner instead of blanking the entire screen.

---

## Route Guards and Data Fetching Notes

- `/settings`, `/billing`, and `/settings/api-keys` require authenticated user session.
- `/admin/*` additionally requires `role=admin` from current user profile.
- Do not rely solely on hidden nav; route loaders or page guards must enforce access checks.
- If user loses auth during a settings/admin mutation, clear session and redirect to login with `redirectTo`.

Data fetching should favor:
- initial full skeletons on first load
- stale-while-revalidate behavior on revisits
- keepPreviousData for paginated admin user tables
- 30-second health polling on admin system page, paused when tab hidden if desired

---

## Testing Expectations

The coding agent should implement tests for:
- settings tab persistence via query params
- 2FA enrollment and disable flows
- revoke session and revoke API key confirmations
- billing status banners from URL params
- admin users row mutation safeguards
- admin system health polling with stale-data preservation
- RBAC blocking for admin routes
- mobile rendering of sessions/API key cards
- one-time API key reveal modal acknowledgment logic
- partial subsystem failure rendering on admin system page
