# Frontend Pages — Auth: FlashRoute

---

## Overview

Authentication pages cover login, registration, forgot password, reset password, and email verification for the FlashRoute SaaS product. These pages are intentionally minimal and centered to keep cognitive load low, but they still need production-grade UX: robust form validation, server error mapping, explicit success states, keyboard accessibility, loading protection against duplicate submissions, and support for multi-step login when two-factor authentication is enabled.

All auth pages should use the shared `AuthLayout` wrapper and the design-system primitives defined in `14-FRONTEND-DESIGN-SYSTEM.md`. Use React Hook Form + Zod for client validation, TanStack Query or mutation hooks for all auth submissions, and Zustand for ephemeral auth/session state after successful login.

**Estimated LOC:** 1,500-2,000

---

## Shared Auth Layout

All auth routes render inside `AuthLayout`.

### Layout structure
- full-screen dark background: `min-h-screen bg-gray-950`
- centered content column with max width `max-w-md`
- FlashRoute logo mark + product wordmark at top
- short subtitle: “Flash-loan arbitrage intelligence and execution”
- auth card using elevated surface token
- footer with `© 2026 FlashRoute`, privacy link, and terms link

### Responsive behavior
- Desktop/tablet: centered card with comfortable padding (`p-8`)
- Mobile: edge padding `px-4 py-6`, card width full, footer stacks vertically
- Logo area should shrink slightly on narrow devices but remain visible above the fold with form fields

### Shared elements
- top-level toast provider for non-field errors
- optional page status banner area inside card for success/info messages passed via query params or navigation state
- back-to-login link on all non-login auth routes

### Auth guard behavior
- if authenticated user lands on `/login`, `/register`, `/forgot-password`, `/reset-password`, or `/verify-email`, redirect to `/dashboard` unless the page is specifically handling a forced credential recovery state
- if access token exists but user record is stale, validate session before redirecting

---

## API Error Contract Expectations

The frontend should expect auth endpoints to return one of:
- `message`: general error string
- `code`: stable application error code
- `fieldErrors`: object keyed by field names
- `requiresTwoFactor`: boolean on login challenge responses
- `challengeToken`: short-lived token used to complete 2FA step
- `lockedUntil`: ISO timestamp for account lockouts

Map errors as follows:
- field-specific server errors -> inline field messages via `setError`
- known auth codes -> friendly callout text
- unknown server failure -> top-level form alert + error toast

Example login-specific code mapping:
- `INVALID_CREDENTIALS` -> “Email or password is incorrect.”
- `ACCOUNT_UNVERIFIED` -> show warning alert with CTA to resend verification email
- `ACCOUNT_LOCKED` -> show error alert including relative unlock time
- `TWO_FACTOR_REQUIRED` -> transition UI into 2FA step
- `TWO_FACTOR_INVALID` -> inline error on TOTP field

---

## Page: Login (`/login`)

### Purpose
Authenticate returning users with email/password and optionally a second-factor TOTP code.

### Card content order
1. Title: `Sign in`
2. Subtitle: `Access your dashboard, strategies, and live opportunities.`
3. optional success/info banner from register/reset flows
4. form
5. inline secondary links

### Default form fields
| Field | Type | Validation | Notes |
|---|---|---|---|
| Email | email | Required, valid email, trimmed/lowercased on submit | Autofocus on mount |
| Password | password | Required, min 8 chars | Includes show/hide toggle |
| Remember this device | checkbox | optional | If supported, passed to login endpoint |
| TOTP Code | text | Exactly 6 digits when 2FA step active | Numeric inputMode |

### Validation details
- email: must match Zod email rule after trimming whitespace
- password: required only in primary login step
- TOTP code: regex `^[0-9]{6}$`; strip spaces automatically
- prevent submit when form invalid or mutation pending

### Multi-step 2FA flow
Initial submit calls `POST /api/v1/auth/login` with email + password.

Possible outcomes:
1. **Success with tokens** -> store tokens in auth store, fetch `/api/v1/users/me`, redirect `/dashboard`
2. **2FA required** -> do not clear email; hide password field; show TOTP field and explanatory copy; preserve challenge token in component state only
3. **Lockout/error** -> render form error and keep fields editable after request completes

Second-step submit sends `POST /api/v1/auth/login` again, now including `totpCode` in the same request body, with:
```json
{
  "email": "user@example.com",
  "challengeToken": "...",
  "totpCode": "123456"
}
```

### UI states
#### Default
- email and password fields visible
- primary CTA: `Sign In`
- links: `Forgot password?`, `Don't have an account? Sign up`

#### Loading
- disable inputs and links that would interrupt submission
- button shows spinner and label `Signing in...`
- retain layout to avoid jump

#### 2FA required
- top info banner: `Two-factor authentication required`
- hide password field, keep masked email summary with `Change email` ghost button to reset step
- show TOTP input with helper text: `Enter the 6-digit code from your authenticator app.`
- CTA label changes to `Verify and Sign In`

#### Error
- invalid credentials: inline top error alert + toast
- account locked: error alert includes exact and relative unlock time if provided
- unverified email: warning banner with `Resend verification email` button
- network failure: `Unable to reach FlashRoute. Check your connection and try again.`

### Accessibility and UX requirements
- Enter submits active step
- after 2FA transition, focus moves to TOTP field
- error alert announced via ARIA live region
- password visibility toggle has `aria-label`

---

## Page: Register (`/register`)

### Purpose
Create a new account and start email verification.

### Form fields
| Field | Type | Validation |
|---|---|---|
| Name | text | Required, 2-100 chars, trimmed |
| Email | email | Required, valid email |
| Password | password | Required, min 8, max 128, uppercase + lowercase + number + special |
| Confirm Password | password | Must exactly match password |
| Terms checkbox | checkbox | Required |

### Password strength behavior
Below the password field render a strength meter with 5 checks:
- 8+ characters
- uppercase letter
- lowercase letter
- number
- special character

Strength labels:
- 0-2 criteria: Weak
- 3-4: Moderate
- 5: Strong

This meter is advisory only; actual submission is blocked until all required criteria pass.

### Submit behavior
`POST /api/v1/auth/register`
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "StrongP@ss1"
}
```

### Success behavior
- redirect to `/login?registered=true&email=jane@example.com`
- login page shows success banner: `Account created. Check your email to verify your address before signing in.`
- optionally expose `Resend verification email` CTA if backend supports it

### Failure handling
- duplicate email -> inline error on email field
- weak password returned by server -> map to password field even if client validation passed
- rate limited -> warning banner `Too many sign-up attempts. Please wait a minute and try again.`

### Responsive behavior
- password criteria stack vertically on mobile, two-column list on wider viewports
- terms text wraps under checkbox with accessible label linking to Terms and Privacy pages

---

## Page: Forgot Password (`/forgot-password`)

### Purpose
Initiate password reset without leaking whether an email exists.

### Form fields
| Field | Type | Validation |
|---|---|---|
| Email | email | Required, valid email |

### Submit behavior
`POST /api/v1/auth/forgot-password`
Always present the same success confirmation regardless of whether the account exists.

### States
#### Default
- title `Forgot your password?`
- body copy: `Enter your email and we'll send a reset link if an account exists.`

#### Loading
- disable email field and button
- CTA label `Sending reset link...`

#### Success
Replace form with confirmation panel:
- success icon
- message `If an account exists for that email, a reset link has been sent.`
- secondary action `Back to login`
- tertiary action `Try another email` resets form

#### Error
Only show true transport/system errors. Do not reveal account existence.

### Validation details
- trim and lowercase email on submit
- after success, preserve masked email summary (`Sent to j***@example.com`) only if the product team wants reassurance; if privacy policy forbids this, omit masking summary

---

## Page: Reset Password (`/reset-password?token=...`)

### Purpose
Allow a user with a valid reset token to set a new password.

### Token handling
- read `token` from URL query param
- if token missing, show invalid-link error state immediately with CTA to request a new reset email
- token should not be stored outside page state

### Form fields
| Field | Type | Validation |
|---|---|---|
| New Password | password | Same rules as register |
| Confirm Password | password | Must match |

### Submit behavior
`POST /api/v1/auth/reset-password`
```json
{
  "token": "...",
  "password": "NewStrongP@ss1"
}
```

### States
- **Loading token/initial page:** no preflight API call required unless backend has a token-validation endpoint; if one exists, use it to distinguish expired vs invalid before form render
- **Default:** show password fields + criteria list
- **Submitting:** button `Updating password...`
- **Success:** replace form with success panel and CTA `Go to login`
- **Token invalid/expired:** error icon + message + CTA to `/forgot-password`

### Error mapping
- `TOKEN_INVALID` / `TOKEN_EXPIRED` -> page-level invalid link state
- password validation issues -> inline password errors
- generic server failure -> top form alert

---

## Page: Email Verification (`/verify-email?token=...`)

### Purpose
Consume email verification token and confirm the account.

### Behavior on mount
Read `token` from URL and immediately call `POST /api/v1/auth/verify-email`.

### UI states
#### Loading
- spinner or animated check shield icon
- title `Verifying your email...`
- subtitle `This usually takes a few seconds.`

#### Success
- large success icon
- title `Email verified`
- body `Your account is ready. Sign in to start monitoring arbitrage opportunities.`
- primary CTA `Go to login`

#### Error
- title `Verification link invalid or expired`
- explain likely causes: already used, malformed, expired
- CTA 1 `Request new verification email`
- CTA 2 `Back to login`

### API mapping
`POST /api/v1/auth/verify-email`
```json
{ "token": "..." }
```

Optional resend flow if available:
reuse the registration-success flow and support copy instructing the user to log in and request a fresh verification link through support or a future self-service endpoint
with email captured from query param or manual prompt modal.

---

## Session Storage and Redirect Rules

On successful login:
1. store access token in memory state, not localStorage unless architecture explicitly requires persistence
2. store refresh token in secure httpOnly cookie if backend supports it
3. fetch current user profile and entitlements
4. redirect to `redirectTo` query param if present and safe; otherwise `/dashboard`

If an unauthenticated user attempts to access protected routes, redirect to `/login?redirectTo=<original-path>`.

If user logs out:
- clear auth store
- clear React Query cache for user-scoped resources
- redirect `/login?loggedOut=true`

---

## Detailed Validation and UX Rules

### Client-side validation timing
- validate required fields on blur and on submit
- do not show red error text on untouched fields during initial render
- once a field has been touched, keep validation feedback live for that field
- server-returned field errors should persist until the user changes that field

### Form-level error region
Every auth form should reserve space near the top of the card for a compact alert banner. Use this for:
- invalid login credentials
- expired/malformed reset or verify token
- network connectivity failures
- rate limiting
- unexpected server errors

This prevents layout jumping caused by ad hoc toast-only error handling. Toasts may still be used, but not as the only surface for blocking errors.

### Button and duplicate-submit rules
- disable primary submit CTA while request is in flight
- prevent double Enter submits
- preserve button width when spinner appears
- if a request takes longer than 8 seconds, show helper text under CTA: `Still working... this can happen during high traffic.`

### Browser autofill and password managers
- set proper `autocomplete` attributes:
  - login email: `email`
  - login password: `current-password`
  - register password: `new-password`
  - reset password: `new-password`
  - TOTP field: `one-time-code`
- do not break browser/password-manager autofill with custom nonstandard input structures

---

## Query Param and Navigation State Handling

### Login page query params
Support these optional params for post-flow banners:
- `registered=true`
- `reset=true`
- `loggedOut=true`
- `redirectTo=/protected/path`
- `email=name@example.com` for prefill when safe

### Banner mapping
- `registered=true` -> success banner `Account created. Verify your email before signing in.`
- `reset=true` -> success banner `Password updated. Sign in with your new password.`
- `loggedOut=true` -> info banner `You have been signed out.`

### Safe redirect handling
Only honor same-origin relative redirect targets. Ignore absolute URLs or suspicious values to avoid open redirect vulnerabilities.

---

## Loading, Empty, and Failure Copy Standards

Use concise, product-specific copy rather than generic framework text.

### Recommended copy
- Login unavailable: `FlashRoute is temporarily unavailable. Try again in a moment.`
- Forgot-password success: `If an account exists for that email, a reset link has been sent.`
- Reset token expired: `This reset link is no longer valid. Request a new one to continue.`
- Verify token expired: `This verification link has expired or has already been used.`
- 2FA invalid: `The code is incorrect or expired. Try the latest code from your authenticator app.`

---

## Auth API Mapping Summary

| Page | Method | Endpoint | Success Result | Error Handling |
|---|---|---|---|---|
| Login | POST | `/api/v1/auth/login` | tokens or 2FA challenge | credentials, lockout, unverified, rate limit |
| Register | POST | `/api/v1/auth/register` | redirect to login banner | duplicate email, weak password |
| Forgot Password | POST | `/api/v1/auth/forgot-password` | privacy-safe confirmation | only transport/system failures surfaced |
| Reset Password | POST | `/api/v1/auth/reset-password` | redirect/login success state | invalid token, weak password |
| Verify Email | POST | `/api/v1/auth/verify-email` | verified success panel | invalid/expired token |
| Resend Verification | — | Not exposed as a dedicated MVP endpoint; use support/manual resend workflow | info banner only | deferred until explicit API support is added |

---

## Testing Requirements for Auth Pages

The coding agent should implement page/component tests for:
- login renders correctly
- login validation errors appear on blur/submit
- 2FA flow transitions correctly on `requiresTwoFactor`
- register password strength indicators update live
- register blocks submit until terms accepted
- forgot-password shows privacy-preserving success message
- reset-password handles missing token
- verify-email success and error states render correctly
- keyboard Enter submits forms
- loading states disable duplicate submission
- safe redirect ignores external URLs
- query-param success banners render and clear correctly
