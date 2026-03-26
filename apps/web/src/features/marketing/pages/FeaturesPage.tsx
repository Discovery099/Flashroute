import { ArrowRight, BarChart3, Globe, Activity, Shield, Zap, Users, Key } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@flashroute/ui';

const SECTIONS = [
  {
    id: 'discovery',
    icon: <Zap className="h-8 w-8 text-cyan-400" />,
    title: 'Opportunity Discovery',
    description: 'Graph-based route search identifies multi-hop arbitrage cycles across DeFi liquidity pools. Real-time state normalization accounts for pending reserves and recent trades.',
    bullets: [
      'Multi-hop cycle evaluation across DEXes',
      'Pool state normalization with pending trade impact',
      'Profitability ranking with expiration handling',
      'Cross-pool route visualization',
    ],
  },
  {
    id: 'prediction',
    icon: <Activity className="h-8 w-8 text-cyan-400" />,
    title: 'Demand Prediction',
    description: 'Ingestion of pending mempool transactions enables projection of reserve changes before they settle. Confidence scores separate predicted from observed state.',
    bullets: [
      'Pending transaction ingestion and classification',
      'Projected reserve change calculations',
      'Confidence scoring with uncertainty bounds',
      'Separation of predicted vs observed market state',
    ],
  },
  {
    id: 'execution',
    icon: <Shield className="h-8 w-8 text-cyan-400" />,
    title: 'Execution Controls',
    description: 'Flash loan provider abstraction, configurable risk parameters, and private relay submission give operators precise control over execution behavior.',
    bullets: [
      'Flash loan provider selection (Aave, dYdX, etc.)',
      'Min profit and max gas constraint enforcement',
      'Private relay submission via Flashbots MEV-Protect',
      'Wallet safety patterns and profit sweeping',
    ],
  },
  {
    id: 'analytics',
    icon: <BarChart3 className="h-8 w-8 text-cyan-400" />,
    title: 'Analytics',
    description: 'Comprehensive execution analytics with trade replay, gas analysis, and competitor monitoring. Compare simulated outcomes against actual execution results.',
    bullets: [
      'Strategy-level PnL tracking and reporting',
      'Trade replay with simulated vs actual comparison',
      'Gas cost analytics and optimization insights',
      'Competitor strategy monitoring',
    ],
  },
  {
    id: 'platform',
    icon: <Users className="h-8 w-8 text-cyan-400" />,
    title: 'Team & Platform',
    description: 'Subscription tiers with role-based access, API key management, and collaborative alerting for team environments.',
    bullets: [
      'Role-based access control (viewer, operator, admin)',
      'API key management with permission scopes',
      'Configurable alerts with multiple delivery channels',
      'Multi-seat support on higher tiers',
    ],
  },
];

export function FeaturesPage() {
  return (
    <div className="space-y-20 py-12 lg:py-16">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Built for serious DeFi operators
        </h1>
        <p className="mx-auto max-w-2xl text-fx-text-secondary">
          Real-time intelligence, precise controls, and comprehensive analytics — from discovery through execution.
        </p>
      </section>

      {SECTIONS.map((section, index) => (
        <section key={section.id} className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className={`space-y-6 ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
            <div className="inline-flex items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              {section.icon}
            </div>
            <h2 className="text-2xl font-semibold text-fx-text-primary">{section.title}</h2>
            <p className="text-fx-text-secondary">{section.description}</p>
            <ul className="space-y-3">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-sm text-fx-text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div className={`rounded-2xl border border-fx-border bg-fx-surface p-8 ${index % 2 === 1 ? 'lg:order-1' : ''}`}>
            <div className="aspect-video rounded-xl border border-fx-border-subtle bg-fx-surface-strong flex items-center justify-center">
              <span className="text-fx-text-muted text-sm">Screenshot / diagram placeholder</span>
            </div>
          </div>
        </section>
      ))}

      <section className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <Globe className="h-8 w-8 text-cyan-400 mb-4" />
          <h3 className="text-lg font-semibold text-fx-text-primary">Multi-Chain Support</h3>
          <p className="mt-2 text-sm text-fx-text-secondary">
            Ethereum, Arbitrum, and Base at launch. Additional L2 networks planned.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-fx-text-muted">
            <li>Ethereum Mainnet</li>
            <li>Arbitrum One</li>
            <li>Base (Coinbase L2)</li>
          </ul>
        </Card>
        <Card className="p-6">
          <Key className="h-8 w-8 text-cyan-400 mb-4" />
          <h3 className="text-lg font-semibold text-fx-text-primary">API Access</h3>
          <p className="mt-2 text-sm text-fx-text-secondary">
            Programmatic access to opportunities, signals, and execution on Institutional tier.
          </p>
          <Button as={Link} to="/docs-preview" variant="secondary" size="sm" className="mt-4">
            View API Preview
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </section>

      <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/5 to-blue-500/5 p-12 text-center">
        <h2 className="text-2xl font-semibold text-fx-text-primary">Ready to get started?</h2>
        <p className="mx-auto mt-4 max-w-xl text-fx-text-secondary">
          Start with the Monitor tier for free. No credit card required.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button as={Link} to="/register" size="lg">
            Start Monitoring
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button as={Link} to="/pricing" variant="secondary" size="lg">
            View Pricing
          </Button>
        </div>
      </section>
    </div>
  );
}
