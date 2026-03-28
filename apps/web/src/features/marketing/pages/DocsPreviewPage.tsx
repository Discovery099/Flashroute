import { ArrowRight, Code, FileText, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@flashroute/ui';

const API_SAMPLE = {
  endpoint: '/api/v1/opportunities',
  method: 'GET',
  description: 'Retrieve a list of arbitrage opportunities filtered by chain, minimum profit, and time window.',
  response: {
    success: true,
    opportunities: [
      {
        id: 'opp_abc123',
        chainId: 1,
        route: ['USDC', 'WETH', 'DAI', 'USDC'],
        estimatedProfit: 842.50,
        confidence: 0.94,
        gasEstimate: 142000,
        expiresAt: '2026-03-26T12:30:00Z',
      },
    ],
  },
};

const WEBHOOK_SAMPLE = {
  event: 'trade.executed',
  timestamp: '2026-03-26T10:15:30Z',
  data: {
    tradeId: 'trade_xyz789',
    strategyId: 'strat_abc123',
    route: ['USDC', 'WETH', 'DAI', 'USDC'],
    executedAmount: 50000,
    profit: 842.50,
    gasCost: 12.40,
    netProfit: 830.10,
    executionStatus: 'success',
  },
};

const CODE_SAMPLES = [
  {
    language: 'curl',
    code: `curl -X GET "https://api.flashroute.io/v1/opportunities?chain=1&minProfit=100" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  },
  {
    language: 'typescript',
    code: `import FlashRoute from '@flashroute/sdk';

const client = new FlashRoute({
  apiKey: process.env.FLASHROUTE_API_KEY,
});

const opportunities = await client.opportunities.list({
  chain: 1,
  minProfit: 100,
});

console.log(opportunities);`,
  },
];

const DOC_SECTIONS = [
  { title: 'Authentication', description: 'API keys and OAuth 2.0 flows', locked: false },
  { title: 'Opportunities API', description: 'Real-time arbitrage opportunity data', locked: false },
  { title: 'Strategies API', description: 'Create and manage execution strategies', locked: true },
  { title: 'Trades API', description: 'Execution history and trade details', locked: true },
  { title: 'Webhooks', description: 'Real-time trade and opportunity events', locked: true },
  { title: 'Rate Limits', description: 'Request quotas by tier', locked: false },
];

export function DocsPreviewPage() {
  return (
    <div className="space-y-16 py-12 lg:py-16">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Developer Documentation
        </h1>
        <p className="mx-auto max-w-2xl text-fx-text-secondary">
          Build with FlashRoute API. Access opportunities, manage strategies, and integrate execution into your own systems.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-8">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Code className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-fx-text-primary">Opportunities API</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded bg-emerald-400/10 px-2 py-1 text-xs font-mono font-medium text-emerald-400">
                  {API_SAMPLE.method}
                </span>
                <code className="text-sm text-fx-text-secondary">{API_SAMPLE.endpoint}</code>
              </div>
              <p className="text-sm text-fx-text-secondary">{API_SAMPLE.description}</p>
              <div className="rounded-xl bg-gray-900 p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                <pre>{JSON.stringify(API_SAMPLE.response, null, 2)}</pre>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-fx-text-primary">Webhook Payload</h2>
            </div>
            <p className="text-sm text-fx-text-secondary mb-4">
              Receive real-time trade execution events via webhook.
            </p>
            <div className="rounded-xl bg-gray-900 p-4 font-mono text-xs text-gray-300 overflow-x-auto">
              <pre>{JSON.stringify(WEBHOOK_SAMPLE, null, 2)}</pre>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-fx-text-primary mb-4">Code Examples</h2>
            <div className="space-y-4">
              {CODE_SAMPLES.map((sample) => (
                <div key={sample.language}>
                  <p className="text-xs uppercase tracking-wider text-fx-text-muted mb-2">{sample.language}</p>
                  <div className="rounded-xl bg-gray-900 p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                    <pre>{sample.code}</pre>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <LinkIcon className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold text-fx-text-primary">Documentation Sections</h3>
            </div>
            <ul className="space-y-3">
              {DOC_SECTIONS.map((section) => (
                <li key={section.title} className="flex items-center justify-between text-sm">
                  <span className={section.locked ? 'text-fx-text-muted' : 'text-fx-text-secondary'}>
                    {section.title}
                  </span>
                  {section.locked ? (
                    <span className="text-xs text-amber-400/70">🔒 Locked</span>
                  ) : (
                    <span className="text-xs text-emerald-400">✓</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-fx-text-primary mb-2">Get API Access</h3>
            <p className="text-sm text-fx-text-secondary mb-4">
              API access requires Trader tier or higher.
            </p>
            <Button as={Link} to="/register?plan=trader" size="sm" className="w-full">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-fx-text-primary mb-2">Full Documentation</h3>
            <p className="text-sm text-fx-text-secondary mb-4">
              Complete API reference and integration guides available to registered users.
            </p>
            <Button as={Link} to="/register" variant="secondary" size="sm" className="w-full">
              Create Account
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
