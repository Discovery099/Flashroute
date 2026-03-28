import { Activity, ArrowRight, CheckCircle, Zap, Shield, BarChart3, Globe, Key, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@flashroute/ui';

const COMPATIBILITY_BADGES = [
  'Ethereum',
  'Arbitrum',
  'Base',
  'Uniswap',
  'SushiSwap',
  'Curve',
  'Balancer',
  'Flashbots',
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Index liquidity and pending swaps',
    description: 'Continuous monitoring of pool reserves across DEXes and ingestion of pending mempool transactions.',
    bullets: [
      'Real-time reserve tracking',
      'Pending tx impact projection',
      'Multi-pool state normalization',
    ],
  },
  {
    step: '02',
    title: 'Simulate routes with constraints',
    description: 'Path-finding algorithm evaluates multi-hop cycles against gas, slippage, and risk parameters.',
    bullets: [
      'Profitability ranking',
      'Gas-optimized routing',
      'Risk buffer enforcement',
    ],
  },
  {
    step: '03',
    title: 'Execute privately or monitor manually',
    description: 'Submit through Flashbots MEV-Protect or monitor until conditions are favorable.',
    bullets: [
      'Private bundle submission',
      'Simulated vs actual comparison',
      'Full execution audit trail',
    ],
  },
];

const FEATURE_CARDS = [
  {
    icon: <Zap className="h-6 w-6 text-cyan-400" />,
    title: 'Multi-hop arbitrage route search',
    description: 'Graph-based cycle detection across DeFi liquidity pools.',
  },
  {
    icon: <Activity className="h-6 w-6 text-cyan-400" />,
    title: 'Mempool-aware demand prediction',
    description: 'Pending swap impact projections with confidence scoring.',
  },
  {
    icon: <Shield className="h-6 w-6 text-cyan-400" />,
    title: 'Flash loan provider abstraction',
    description: 'Unified interface across Aave, dYdX, and other providers.',
  },
  {
    icon: <Key className="h-6 w-6 text-cyan-400" />,
    title: 'Strategy controls and risk buffers',
    description: 'Min profit thresholds, gas ceilings, and slippage limits.',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-cyan-400" />,
    title: 'Trade replay and analytics',
    description: 'Compare simulated outcomes against actual execution results.',
  },
  {
    icon: <Bell className="h-6 w-6 text-cyan-400" />,
    title: 'Alerting and API access',
    description: 'Configurable alerts and programmatic access to signals.',
  },
  {
    icon: <Globe className="h-6 w-6 text-cyan-400" />,
    title: 'Multi-chain expansion',
    description: 'Support for Arbitrum, Base, and additional L2 networks.',
  },
  {
    icon: <CheckCircle className="h-6 w-6 text-cyan-400" />,
    title: 'Execution health controls',
    description: 'Pause, resume, and emergency stop for automated strategies.',
  },
];

const COMPARISON_TABLE = [
  { capability: 'Pool monitoring', manual: 'Fragmented scripts', flashroute: 'Unified monitoring layer' },
  { capability: 'Route discovery', manual: 'Ad hoc, hard to inspect', flashroute: 'Ranked opportunities with confidence' },
  { capability: 'Demand prediction', manual: 'Absent in most tools', flashroute: 'Pending swap impact projections' },
  { capability: 'Execution analytics', manual: 'Manual spreadsheets', flashroute: 'Structured trade history and charts' },
  { capability: 'Multi-user access', manual: 'None', flashroute: 'Subscription tiers and dashboards' },
];

const RISK_CONTROLS = [
  'Minimum profit thresholds per route',
  'Gas ceiling limits with auto-abort',
  'Slippage and risk buffer configuration',
  'Private bundle submission (frontrun mitigation)',
  'Post-trade: simulated vs actual comparison',
  'Emergency pause and global kill switch',
];

const PRICING_TIERS = [
  { name: 'Monitor', price: 'Free', bestFor: 'Historical analytics and opportunity discovery' },
  { name: 'Trader', price: '$49/mo', bestFor: 'Real-time signals and prediction access' },
  { name: 'Executor', price: '$149/mo', bestFor: 'Automated execution and strategy controls' },
  { name: 'Institutional', price: 'Custom', bestFor: 'API access, priority support, custom limits' },
];

const FAQ_PREVIEW = [
  {
    q: 'Does FlashRoute guarantee profitable trades?',
    a: 'No. FlashRoute provides monitoring, simulation, and execution tooling. Profitability depends on market conditions, gas costs, and execution quality.',
  },
  {
    q: 'What chains and DEXes are supported?',
    a: 'Ethereum, Arbitrum, and Base. Supported DEXes include Uniswap, SushiSwap, Curve, Balancer, and others.',
  },
  {
    q: 'Can I use the platform for monitoring only?',
    a: 'Yes. The Monitor tier provides historical analytics and alerts without requiring automated execution.',
  },
  {
    q: 'How does private bundle submission work?',
    a: 'FlashRoute submits transactions through Flashbots MEV-Protect to reduce frontrunning risk. This does not eliminate all execution risk.',
  },
];

export function LandingPage() {
  return (
    <div className="space-y-20 py-12 lg:py-20">
      <section className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-1.5 text-xs uppercase tracking-[0.28em] text-cyan-200">
            <Activity className="h-3.5 w-3.5" />
            Operator-grade arbitrage tooling
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl lg:text-6xl">
              Discover and execute flash-loan arbitrage with mempool-aware route intelligence.
            </h1>
            <p className="max-w-2xl text-base text-fx-text-secondary md:text-lg">
              Cross-DEX route discovery, demand prediction, execution analytics, and private submission — built for serious DeFi operators who need full control.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button as={Link} to="/register" size="lg">
              Start Monitoring
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Button as={Link} to="/pricing" variant="secondary" size="lg">
              See Pricing
            </Button>
          </div>

          <p className="text-sm text-fx-text-muted">
            No promises. Full control. Real-time visibility into profitable route candidates.
          </p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-fx-text-primary">Live Opportunities</h3>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400">Live</span>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { pair: 'USDC/WETH', profit: '+$842', confidence: '94%', gas: '142gwei' },
                { pair: 'DAI/USDT', profit: '+$231', confidence: '87%', gas: '128gwei' },
                { pair: 'WBTC/ETH', profit: '+$1,247', confidence: '91%', gas: '156gwei' },
              ].map((opp) => (
                <div key={opp.pair} className="flex items-center justify-between rounded-xl border border-fx-border bg-fx-surface-strong/50 p-3">
                  <div>
                    <p className="font-mono text-sm text-cyan-300">{opp.pair}</p>
                    <p className="text-xs text-fx-text-muted">Gas: {opp.gas}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-emerald-400">{opp.profit}</p>
                    <p className="text-xs text-fx-text-muted">{opp.confidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-center gap-6">
          {COMPATIBILITY_BADGES.map((badge) => (
            <span key={badge} className="text-sm text-fx-text-muted">
              {badge}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <Card key={item.step} className="p-6">
              <span className="text-xs font-mono text-cyan-400">{item.step}</span>
              <h3 className="mt-2 text-lg font-semibold text-fx-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm text-fx-text-secondary">{item.description}</p>
              <ul className="mt-4 space-y-2">
                {item.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-2 text-sm text-fx-text-muted">
                    <CheckCircle className="h-4 w-4 text-emerald-400/70" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Platform Capabilities</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((card) => (
            <Card key={card.title} className="p-5">
              <div className="mb-3">{card.icon}</div>
              <h3 className="font-medium text-fx-text-primary">{card.title}</h3>
              <p className="mt-1 text-sm text-fx-text-secondary">{card.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Why Operators Choose FlashRoute</h2>
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-fx-border bg-fx-surface-strong/50 text-left text-xs uppercase tracking-wider text-fx-text-muted">
                <th className="p-4 font-medium">Capability</th>
                <th className="p-4 font-medium">Manual Operator Setup</th>
                <th className="p-4 font-medium text-cyan-400">FlashRoute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fx-border">
              {COMPARISON_TABLE.map((row) => (
                <tr key={row.capability} className="text-sm">
                  <td className="p-4 font-medium text-fx-text-primary">{row.capability}</td>
                  <td className="p-4 text-fx-text-secondary">{row.manual}</td>
                  <td className="p-4 text-emerald-400">{row.flashroute}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Risk Controls</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {RISK_CONTROLS.map((control) => (
            <div key={control} className="flex items-start gap-3 rounded-xl border border-fx-border bg-fx-surface p-4">
              <Shield className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-fx-text-primary">{control}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Choose Your Plan</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((tier) => (
            <Card key={tier.name} className="p-5">
              <h3 className="font-medium text-fx-text-primary">{tier.name}</h3>
              <p className="mt-1 text-2xl font-semibold text-cyan-400">{tier.price}</p>
              <p className="mt-2 text-sm text-fx-text-secondary">{tier.bestFor}</p>
              <Button as={Link} to="/register" variant="secondary" size="sm" className="mt-4 w-full">
                {tier.name === 'Institutional' ? 'Book Demo' : 'Get Started'}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Frequently Asked Questions</h2>
        <div className="mx-auto max-w-3xl space-y-4">
          {FAQ_PREVIEW.map((faq) => (
            <Card key={faq.q} className="p-5">
              <h3 className="font-medium text-fx-text-primary">{faq.q}</h3>
              <p className="mt-2 text-sm text-fx-text-secondary">{faq.a}</p>
            </Card>
          ))}
        </div>
        <div className="text-center">
          <Button as={Link} to="/faq" variant="secondary">
            View All FAQs
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 p-12 text-center">
        <h2 className="text-3xl font-semibold text-fx-text-primary">Ready to get started?</h2>
        <p className="mx-auto mt-4 max-w-xl text-fx-text-secondary">
          Start with the Monitor tier for free and scale up as your strategy matures.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button as={Link} to="/register" size="lg">
            Start Monitoring
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button as={Link} to="/contact-sales" variant="secondary" size="lg">
            Talk to Sales
          </Button>
        </div>
      </section>
    </div>
  );
}
