import { Check, X, ArrowRight, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@flashroute/ui';

const TIERS = [
  {
    id: 'monitor',
    name: 'Monitor',
    price: 'Free',
    description: 'Historical analytics and opportunity discovery for DeFi operators getting started.',
    idealFor: 'Solo operators exploring arbitrage opportunities',
    features: [
      { label: 'Strategies', value: 'Up to 2', included: true },
      { label: 'Real-time opportunities', value: 'No', included: false },
      { label: 'Demand prediction', value: 'No', included: false },
      { label: 'Automated execution', value: 'No', included: false },
      { label: 'Multi-chain support', value: 'No', included: false },
      { label: 'API access', value: 'No', included: false },
      { label: 'Historical analytics', value: 'Yes', included: true },
      { label: 'Alerts', value: 'Limited', included: true },
    ],
    cta: 'Get Started',
    ctaTo: '/register?plan=monitor',
  },
  {
    id: 'trader',
    name: 'Trader',
    price: '$49',
    period: '/month',
    description: 'Real-time signals and prediction access for active DeFi traders.',
    idealFor: 'Traders who want live market intelligence',
    features: [
      { label: 'Strategies', value: 'Up to 10', included: true },
      { label: 'Real-time opportunities', value: 'Yes', included: true },
      { label: 'Demand prediction', value: 'Yes', included: true },
      { label: 'Automated execution', value: 'No', included: false },
      { label: 'Multi-chain support', value: 'No', included: false },
      { label: 'API access', value: 'No', included: false },
      { label: 'Historical analytics', value: 'Yes', included: true },
      { label: 'Alerts', value: 'Unlimited', included: true },
    ],
    cta: 'Start Trading',
    ctaTo: '/register?plan=trader',
    popular: true,
  },
  {
    id: 'executor',
    name: 'Executor',
    price: '$149',
    period: '/month',
    description: 'Automated execution and advanced strategy controls for professional operators.',
    idealFor: 'Active traders running automated strategies',
    features: [
      { label: 'Strategies', value: 'Up to 25', included: true },
      { label: 'Real-time opportunities', value: 'Yes', included: true },
      { label: 'Demand prediction', value: 'Yes', included: true },
      { label: 'Automated execution', value: 'Yes', included: true },
      { label: 'Multi-chain support', value: 'Yes', included: true },
      { label: 'API access', value: 'No', included: false },
      { label: 'Historical analytics', value: 'Yes', included: true },
      { label: 'Alerts', value: 'Unlimited', included: true },
    ],
    cta: 'Start Executing',
    ctaTo: '/register?plan=executor',
  },
  {
    id: 'institutional',
    name: 'Institutional',
    price: 'Custom',
    description: 'API access, priority support, and custom limits for funds and trading desks.',
    idealFor: 'Funds, trading desks, and institutional teams',
    features: [
      { label: 'Strategies', value: 'Unlimited', included: true },
      { label: 'Real-time opportunities', value: 'Yes', included: true },
      { label: 'Demand prediction', value: 'Yes', included: true },
      { label: 'Automated execution', value: 'Yes', included: true },
      { label: 'Multi-chain support', value: 'Yes', included: true },
      { label: 'API access', value: 'Execute', included: true },
      { label: 'Historical analytics', value: 'Yes', included: true },
      { label: 'Alerts', value: 'Unlimited', included: true },
    ],
    cta: 'Book Demo',
    ctaTo: '/contact-sales',
  },
];

const FEATURE_GROUPS = [
  {
    category: 'Monitoring',
    rows: [
      { feature: 'Historical analytics', monitor: true, trader: true, executor: true, institutional: true },
      { feature: 'Real-time opportunities', monitor: false, trader: true, executor: true, institutional: true },
      { feature: 'Mempool demand prediction', monitor: false, trader: true, executor: true, institutional: true },
    ],
  },
  {
    category: 'Execution',
    rows: [
      { feature: 'Automated execution', monitor: false, trader: false, executor: true, institutional: true },
      { feature: 'Flash loan abstraction', monitor: false, trader: false, executor: true, institutional: true },
      { feature: 'Private bundle submission', monitor: false, trader: false, executor: true, institutional: true },
    ],
  },
  {
    category: 'Analytics',
    rows: [
      { feature: 'Trade replay', monitor: false, trader: false, executor: true, institutional: true },
      { feature: 'Gas analytics', monitor: false, trader: false, executor: true, institutional: true },
      { feature: 'Competitor monitoring', monitor: false, trader: false, executor: true, institutional: true },
    ],
  },
  {
    category: 'Platform',
    rows: [
      { feature: 'Multi-chain support', monitor: false, trader: false, executor: true, institutional: true },
      { feature: 'Team seats', monitor: '1', trader: '1', executor: '3', institutional: 'Custom' },
      { feature: 'API access', monitor: 'None', trader: 'None', executor: 'None', institutional: 'Execute' },
    ],
  },
  {
    category: 'Support',
    rows: [
      { feature: 'Alerts', monitor: '3', trader: 'Unlimited', executor: 'Unlimited', institutional: 'Unlimited' },
      { feature: 'Support', monitor: 'Community', trader: 'Email', executor: 'Priority', institutional: 'Dedicated' },
    ],
  },
];

export function PricingPage() {
  return (
    <div className="space-y-20 py-12 lg:py-16">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto max-w-2xl text-fx-text-secondary">
          Scale from opportunity discovery to full execution. All plans include historical analytics and risk controls.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => (
          <Card
            key={tier.id}
            className={`relative p-6 ${tier.popular ? 'border-cyan-400/50 bg-cyan-400/5' : ''}`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-400">
                Most Popular
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-fx-text-primary">{tier.name}</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-cyan-400">{tier.price}</span>
                  {tier.period && <span className="text-fx-text-muted">{tier.period}</span>}
                </div>
                <p className="mt-2 text-sm text-fx-text-secondary">{tier.description}</p>
              </div>

              <p className="text-xs text-fx-text-muted">{tier.idealFor}</p>

              <Button
                as={Link}
                to={tier.ctaTo}
                variant={tier.popular ? 'primary' : 'secondary'}
                className="w-full"
              >
                {tier.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="space-y-2 pt-4">
                {tier.features.map((feature) => (
                  <div key={feature.label} className="flex items-center justify-between text-sm">
                    <span className="text-fx-text-secondary">{feature.label}</span>
                    <span className={feature.included ? 'text-fx-text-primary' : 'text-fx-text-muted'}>
                      {feature.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-6">
        <h2 className="text-center text-2xl font-semibold text-fx-text-primary">Full Feature Comparison</h2>
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-fx-border bg-fx-surface-strong/50 text-left text-xs uppercase tracking-wider text-fx-text-muted">
                <th className="p-4 font-medium">Feature</th>
                <th className="p-4 font-medium text-center">Monitor</th>
                <th className="p-4 font-medium text-center">Trader</th>
                <th className="p-4 font-medium text-center text-cyan-400">Executor</th>
                <th className="p-4 font-medium text-center">Institutional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fx-border">
              {FEATURE_GROUPS.map((group) => (
                <>
                  <tr key={group.category} className="bg-fx-surface-strong/30">
                    <td colSpan={5} className="p-3 text-xs font-semibold uppercase tracking-wider text-cyan-400/80">
                      {group.category}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.feature} className="text-sm">
                      <td className="p-4 text-fx-text-primary">{row.feature}</td>
                      <td className="p-4 text-center">
                        {typeof row.monitor === 'boolean' ? (
                          row.monitor ? (
                            <Check className="mx-auto h-5 w-5 text-emerald-400" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-fx-text-muted/30" />
                          )
                        ) : (
                          <span className="text-fx-text-secondary">{row.monitor}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof row.trader === 'boolean' ? (
                          row.trader ? (
                            <Check className="mx-auto h-5 w-5 text-emerald-400" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-fx-text-muted/30" />
                          )
                        ) : (
                          <span className="text-fx-text-secondary">{row.trader}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof row.executor === 'boolean' ? (
                          row.executor ? (
                            <Check className="mx-auto h-5 w-5 text-emerald-400" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-fx-text-muted/30" />
                          )
                        ) : (
                          <span className="text-cyan-400">{row.executor}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {typeof row.institutional === 'boolean' ? (
                          row.institutional ? (
                            <Check className="mx-auto h-5 w-5 text-emerald-400" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-fx-text-muted/30" />
                          )
                        ) : (
                          <span className="text-fx-text-secondary">{row.institutional}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-6">
        <div className="rounded-2xl border border-fx-border bg-fx-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10">
            <Shield className="h-6 w-6 text-cyan-400" />
          </div>
          <h3 className="text-xl font-semibold text-fx-text-primary">Enterprise and Custom Needs</h3>
          <p className="mx-auto mt-2 max-w-xl text-fx-text-secondary">
            Need custom limits, dedicated support, or on-premise deployment? Talk to our team about institutional pricing.
          </p>
          <Button as={Link} to="/contact-sales" variant="secondary" className="mt-6">
            Contact Sales
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="space-y-4 text-center text-sm text-fx-text-muted">
        <p>
          All prices in USD. Monthly billing. Annual plans available with discount.
        </p>
        <p>
          Chain and DEX compatibility may affect available features. Subject to our{' '}
          <Link to="/terms" className="text-cyan-400 hover:underline">Terms of Service</Link> and{' '}
          <Link to="/risk-disclosure" className="text-cyan-400 hover:underline">Risk Disclosure</Link>.
        </p>
      </section>
    </div>
  );
}
