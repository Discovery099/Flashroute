# Frontend Pages — Marketing & Public Site: FlashRoute

---

## Purpose

These pages sit outside the authenticated dashboard and exist to convert three buyer types:

1. **Solo operators** who want direct arbitrage profit tools
2. **Serious DeFi traders** who want real-time signals and dashboards
3. **Small funds / crypto-native teams** who want execution infrastructure, analytics, and APIs

The public site must not look like generic SaaS chrome. It should communicate speed, market structure knowledge, credible technical depth, and clear trust boundaries. The tone should be operator-grade rather than hype-heavy. Avoid promises like “guaranteed profit.” Emphasize discovery, simulation, execution control, historical analytics, and risk controls.

**Estimated implementation LOC:** 4,000–6,000 for pages, shared sections, CTAs, pricing tables, FAQ accordions, legal pages, and analytics instrumentation.

---

## Routing Map

| Route | Purpose | Auth Required |
|---|---|---|
| `/` | Primary landing page | No |
| `/pricing` | Pricing grid, feature comparison, upgrade CTAs | No |
| `/features` | Deep product capabilities overview | No |
| `/security` | Trust, safety model, wallet handling, data isolation | No |
| `/case-studies` | Example operator workflows and ROI narratives | No |
| `/faq` | Public objections and onboarding clarifications | No |
| `/contact-sales` | Lead capture for institutional tier | No |
| `/docs-preview` | Public documentation teaser and API examples | No |
| `/terms` | Terms of service | No |
| `/privacy` | Privacy policy | No |
| `/risk-disclosure` | Explicit trading and DeFi risk disclosure | No |

All public pages use a dedicated `MarketingLayout` rather than the dashboard shell. Header stays transparent on hero sections and becomes solid on scroll. Footer is shared across all pages.

---

## Shared Marketing Layout

### Structural Requirements

`MarketingLayout` includes:
- Sticky top navigation with logo, primary nav links, pricing link, sign-in link, and primary CTA
- Main content region constrained to `max-w-7xl`
- Shared footer with product links, company links, legal links, social links, and disclosure text
- Global background using subtle radial gradients over `bg-gray-950`
- Optional banner slot for incident notices, launch announcements, or waitlist messaging

### Header Navigation

Left:
- FlashRoute wordmark
- Links: Features, Pricing, Security, Docs Preview, FAQ

Right:
- “Sign In” ghost button
- “Start Monitoring” primary button → `/register`
- On mobile: hamburger menu opening full-screen drawer

### Footer Sections

Columns:
- Product: Features, Pricing, Docs Preview
- Use Cases: Solo Operators, Traders, Funds
- Company: Security, Contact Sales, FAQ
- Legal: Terms, Privacy, Risk Disclosure

Footer disclaimer text must state that FlashRoute provides monitoring, analytics, and execution tooling, and that profitability depends on market conditions, competition, gas costs, and execution success.

---

## Visual and Conversion Rules

### Design Direction

- Dark trading-terminal aesthetic matching dashboard tokens
- Motion should be restrained: fade, slight translate, number ticker, soft glow on live data elements
- Use monospace for route examples, contract addresses, gas metrics, and execution stats
- Emphasize measurable claims: “sub-second opportunity refresh,” “private bundle submission,” “historical execution analytics,” rather than vague slogans

### CTA Strategy

Primary CTA variants:
- `Start Monitoring` → free/monitor registration
- `See Pricing` → pricing page
- `Book Institutional Demo` → contact-sales

CTA placement rules:
- Hero section: one primary, one secondary CTA
- Every long page: CTA block after major proof section and again near footer
- Pricing page: CTA in each tier card plus sticky mobile upgrade footer

### Proof Elements

The marketing UI should include believable proof without implying audited real PnL unless backed by actual data. Use:
- Example opportunity cards labeled as sample/live-preview where appropriate
- Product screenshots from dashboard modules
- Capability callouts like “private relay submission,” “strategy risk buffers,” “multi-hop route simulation,” “mempool-aware demand prediction”
- Security and risk boundary cards

---

## Page: Landing (`/`)

### Goal

Answer four questions within the first viewport and two scrolls:
1. What is FlashRoute?
2. Who is it for?
3. What does it actually do technically?
4. Why should the visitor trust it enough to sign up?

### Section Order

#### 1. Hero Section

Left content:
- Headline: operator-focused, e.g. “Discover and execute flash-loan arbitrage with mempool-aware route intelligence.”
- Supporting text: mention cross-DEX route discovery, demand prediction, execution analytics, and private submission
- CTA row: `Start Monitoring`, `See Pricing`
- Secondary subtext: “No promises. Full control. Real-time visibility into profitable route candidates.”

Right content:
- Interactive mock dashboard panel showing:
  - live opportunity list
  - route visualization
  - estimated net profit
  - confidence score
  - gas estimate
- Include animated connection indicator and chain selector chip

#### 2. Social/Trust Band

Display logos or text badges for supported infrastructure and DEX ecosystems:
- Ethereum
- Arbitrum
- Base
- Uniswap
- SushiSwap
- Curve
- Balancer
- Flashbots

These are compatibility badges, not partnership claims.

#### 3. “How It Works” 3-Step Strip

Cards:
1. **Index liquidity and pending swaps**
2. **Simulate routes with gas and slippage constraints**
3. **Execute privately or monitor manually**

Each card includes 2–3 technical bullets. Avoid business fluff.

#### 4. Feature Grid

Six to eight feature cards:
- Multi-hop arbitrage route search
- Mempool-aware demand prediction
- Flash loan provider abstraction
- Strategy controls and risk buffers
- Trade replay and analytics
- Alerting and API access
- Multi-chain expansion path
- Admin health and execution controls

#### 5. Product Screenshot Section

Tabbed showcase with screenshot areas for:
- Dashboard overview
- Opportunities feed
- Strategy configuration
- Trade detail replay
- Analytics and competitor tab

Tabs update caption text and bullet list.

#### 6. Why Operators Choose FlashRoute

Comparison table versus manual workflows:

| Capability | Manual operator setup | FlashRoute |
|---|---|---|
| Pool monitoring | fragmented scripts | unified monitoring layer |
| Route discovery | ad hoc, hard to inspect | ranked opportunities with confidence |
| Demand prediction | absent in most tools | pending swap impact projections |
| Execution analytics | manual spreadsheets | structured trade history and charts |
| Multi-user access | none | subscription tiers and dashboards |

#### 7. Risk Controls Section

Highlight what the product does to reduce bad execution:
- minimum profit thresholds
- gas ceiling
- slippage and risk buffers
- private bundle submission
- post-trade comparison of simulated vs actual outcome
- emergency pause controls

#### 8. Pricing Preview Strip

Mini cards for Monitor / Trader / Executor / Institutional, each with “best for” descriptor and CTA.

#### 9. FAQ Preview

Top 4 questions from full FAQ with link to `/faq`.

#### 10. Final CTA

Headline, brief reassurance, primary CTA.

### Landing Page States

- **Default loaded:** all sections rendered, lazy-loaded screenshot images below fold
- **Analytics disabled:** page still loads if marketing analytics provider blocked; no broken UI
- **Screenshot assets unavailable:** fallback gradient mock card with text caption
- **Public API preview unavailable:** docs preview widgets show sample JSON rather than erroring

---

## Page: Pricing (`/pricing`)

### Goal

Make tiering legible and map directly to user maturity.

### Top Section

Headline + monthly/annual toggle if annual billing exists later. If only monthly is supported now, keep toggle hidden rather than disabled.

### Tier Cards

Four cards:
- **Monitor** — free or low-friction starter, historical analytics and limited alerts
- **Trader** — real-time signals and prediction access
- **Executor** — automated execution and advanced strategy controls
- **Institutional** — API, priority support, custom limits, onboarding

Each card must include:
- price
- ideal user label
- core included features
- one-line limitations
- CTA
- footnote on chain/provider dependence where relevant

### Feature Matrix

Rows grouped by:
- Monitoring
- Predictions
- Execution
- Analytics
- Collaboration / API
- Support

Cells use icons plus concise notes, not just checkmarks.

### Billing Logic

CTAs:
- Unauthenticated users → `/register?plan=<tier>`
- Authenticated users on free plan → create Stripe checkout session for selected tier
- Current paid plan card → disabled “Current Plan” state
- Institutional card → `Book Demo` opens contact form instead of Stripe

### Pricing States

- **Logged out:** all purchase CTAs route through registration
- **Logged in with active plan:** active tier visually emphasized
- **Stripe config unavailable:** paid CTAs disabled with inline message “Billing temporarily unavailable, contact support”
- **Institutional request submitted:** banner confirms submission and expected response window

---

## Page: Features (`/features`)

### Purpose

This page gives technical buyers more depth than the landing page.

### Section Groups

#### Opportunity Discovery
- Graph-based route search
- Multi-hop cycle evaluation
- pool state normalization
- profitability ranking and expiration handling

#### Demand Prediction
- pending transaction ingestion
- projected reserve changes
- confidence scores
- separation between predicted and observed state

#### Execution Controls
- flash loan provider selection
- min profit and max gas constraints
- private relay submission
- pause/resume controls
- wallet safety patterns

#### Analytics
- strategy-level PnL
- trade replay
- gas analytics
- competitor monitoring
- simulated vs actual execution delta

#### Team / Platform
- subscriptions
- alerts
- API keys
- role-based admin controls

Each section should include:
- short paragraph
- screenshot or diagram slot
- four bullets on implementation detail or operator value

---

## Page: Security (`/security`)

### Purpose

Reduce hesitation around wallet risk, execution trust, and SaaS credibility.

### Required Sections

1. **Execution Model**
   - distinguish dashboard account auth from execution wallet handling
   - explain hot-wallet minimization and profit sweeping
2. **Private Order Flow**
   - explain Flashbots/private relay use and frontrun mitigation goals
3. **Infrastructure Controls**
   - environment secrets, role separation, worker isolation, health monitoring
4. **Application Security**
   - JWT auth, 2FA, rate limits, audit logging, session revocation
5. **Smart Contract Posture**
   - immutable deployment philosophy, owner-only execution, emergency withdrawal
6. **Risk Boundaries**
   - explicit statement that software cannot eliminate chain risk, contract risk, or market competition

### Security Page CTA

Bottom CTA should not be “Start Winning.” Use “Review pricing” or “Talk to sales.”

---

## Page: Case Studies (`/case-studies`)

### Purpose

Show concrete usage narratives without making unverifiable claims.

### Content Structure

Three case-style walkthroughs:
- **Solo Operator:** starts on monitor plan, validates opportunities, upgrades to execution
- **Active Trader:** uses prediction feed and historical analytics to tune thresholds
- **Crypto Fund / Desk:** uses API keys, admin controls, and institutional support path

Each case study includes:
- persona
- operational pain before FlashRoute
- workflow inside product
- measurable outcomes described carefully: reduced manual screening time, increased route visibility, improved post-trade analysis, faster strategy iteration

### Important Rule

Do not publish specific PnL percentages unless product data supports it. Prefer operational metrics over ROI marketing fiction.

---

## Page: FAQ (`/faq`)

### Questions to Include

1. What chains and DEXes are supported?
2. Does FlashRoute guarantee profitable trades?
3. Do I need my own capital?
4. How are flash loans sourced?
5. What happens if gas spikes or a route becomes stale?
6. Can I use the platform only for monitoring and not execution?
7. How does private bundle submission work?
8. What subscription tier includes automated execution?
9. Can teams share access?
10. Is there an API?
11. What data does the dashboard store?
12. How do alerts work?

### Interaction Rules

- Accordion list with search input at top
- URL hash support for direct linking to a question
- First item may be open by default on desktop, all collapsed on mobile

---

## Page: Contact Sales (`/contact-sales`)

### Form Fields

| Field | Type | Validation |
|---|---|---|
| Name | text | required, 2–100 chars |
| Work Email | email | required, business email preferred but not required |
| Company / Desk | text | optional, 2–100 chars |
| Team Size | select | 1, 2-5, 6-20, 21+ |
| Monthly Trade Volume Intent | select | exploratory, <$1M, $1M-$10M, $10M+ |
| Primary Need | multi-select | analytics, API, automated execution, multi-user access, custom infra |
| Notes | textarea | max 2000 chars |

### Submit Behavior

- POST to public lead endpoint
- success state replaces form with confirmation card
- UTM parameters captured in payload when present
- spam prevention via honeypot field + server rate limit

---

## Page: Docs Preview (`/docs-preview`)

### Goal

Expose enough technical depth to attract sophisticated users while reserving full docs for customers.

### Sections

- sample API response for opportunities endpoint
- sample webhook payload for trade status
- code snippets in curl and TypeScript
- quick architecture diagram
- list of available private docs sections behind auth

### Conversion Element

Sticky side CTA: “Get access with Trader or higher.”

---

## Legal Pages

### Terms (`/terms`)

Static content page. Sections:
- service scope
- acceptable use
- subscription and billing terms
- limitations of liability
- no investment advice
- account termination
- governing law placeholder

### Privacy (`/privacy`)

Static content page. Sections:
- data collected
- auth/account data
- analytics and cookies
- billing processor data separation
- retention windows
- deletion requests

### Risk Disclosure (`/risk-disclosure`)

Must clearly state:
- DeFi smart contract risk
- flash loan availability risk
- validator/builder/mempool competition risk
- chain reorg risk
- gas volatility
- slippage and stale-state risk
- no guarantee of profit

This page should be linked in footer and referenced during registration/billing.

---

## SEO and Metadata Requirements

Each page defines:
- unique `title`
- `meta description`
- Open Graph image
- canonical URL
- structured data where useful (`FAQPage`, `Product`, `SoftwareApplication`)

Suggested title patterns:
- `FlashRoute — Flash Loan Arbitrage Monitoring and Execution`
- `Pricing — FlashRoute`
- `Security — FlashRoute`

Avoid spam keywords like “guaranteed MEV profits.”

---

## Analytics Instrumentation

Track the following client events:
- landing_cta_clicked
- pricing_cta_clicked
- pricing_tier_selected
- docs_preview_cta_clicked
- faq_expanded
- contact_sales_submitted
- register_from_marketing

Event payload should include:
- page
- tier if relevant
- source section
- utm_source / utm_campaign when available

Analytics failure must never block page rendering or navigation.

---

## Performance Requirements

- Public pages must achieve acceptable Core Web Vitals on standard VPS hosting
- Hero assets lazy-load where possible
- Marketing screenshots should use modern image formats and responsive sizes
- Minimize bundle impact by separating marketing routes from dashboard code via route-level lazy loading
- Use skeletons only for genuinely async public widgets; static page sections should render immediately from build output

---

## Accessibility Requirements

- All CTAs use clear text labels
- Pricing comparison table requires mobile stacked fallback
- FAQ accordion fully keyboard accessible
- Contrast ratios must match dark theme accessibility targets
- Motion reduced when `prefers-reduced-motion` is enabled
- Legal pages use readable prose width and semantic headings

---

## Implementation Notes for Coding Agent

- Build marketing routes in a separate route group from authenticated dashboard pages
- Keep shared token system aligned with `14-FRONTEND-DESIGN-SYSTEM.md`, but allow layout variants specific to marketing
- Prefer reusable section primitives: `HeroSection`, `FeatureCard`, `PricingCard`, `ComparisonTable`, `FAQAccordion`, `LegalPageLayout`
- Keep all claims text in config/content objects so copy can be edited without component rewrites
- Do not hardcode fake “live profit” numbers without labeling them as sample/demo data
- Any public lead or pricing CTA must degrade gracefully when billing or CRM backends are unavailable
