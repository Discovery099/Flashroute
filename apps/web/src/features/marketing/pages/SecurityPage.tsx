import { ArrowRight, Shield, Lock, Eye, Server, FileCheck, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@flashroute/ui';

const SECTIONS = [
  {
    id: 'execution',
    icon: <Shield className="h-8 w-8 text-cyan-400" />,
    title: 'Execution Model',
    description: 'FlashRoute separates dashboard authentication from execution wallet handling. Your execution wallet remains under your control at all times.',
    bullets: [
      'Dashboard uses standard JWT authentication',
      'Execution wallet private keys never stored on FlashRoute servers',
      'Hot-wallet minimization with automated profit sweeping',
      'Withdrawal to your controlled wallet after each session',
    ],
  },
  {
    id: 'privacy',
    icon: <Lock className="h-8 w-8 text-cyan-400" />,
    title: 'Private Order Flow',
    description: 'Transactions submitted through Flashbots MEV-Protect and similar private relay services to reduce frontrunning risk.',
    bullets: [
      'Flashbots MEV-Protect integration for Ethereum',
      'Targeted frontrun risk reduction (not elimination)',
      'Private mempool submission before public broadcast',
      'Transaction bundle transparency to operator only',
    ],
  },
  {
    id: 'infrastructure',
    icon: <Server className="h-8 w-8 text-cyan-400" />,
    title: 'Infrastructure Controls',
    description: 'Production infrastructure uses defense-in-depth with secrets management, role separation, and worker isolation.',
    bullets: [
      'Environment secrets via secure secret store (never in code)',
      'Role separation: indexers, executors, and API workers isolated',
      'Health monitoring with automatic alerting on degradation',
      'Worker process isolation to contain failures',
    ],
  },
  {
    id: 'application',
    icon: <Eye className="h-8 w-8 text-cyan-400" />,
    title: 'Application Security',
    description: 'Authentication, authorization, and audit logging follow security best practices for financial applications.',
    bullets: [
      'JWT-based session auth with secure refresh rotation',
      'Rate limiting on sensitive endpoints',
      'Comprehensive audit logging for admin actions',
      'Session revocation and force logout capability',
    ],
  },
  {
    id: 'contracts',
    icon: <FileCheck className="h-8 w-8 text-cyan-400" />,
    title: 'Smart Contract Posture',
    description: 'FlashRoute contract deployment philosophy prioritizes operator control and emergency recovery.',
    bullets: [
      'Immutable contract deployments where possible',
      'Owner-only administrative functions with timelock',
      'Emergency withdrawal functions for fund recovery',
      'Transparent, audited contract logic',
    ],
  },
  {
    id: 'risk',
    icon: <AlertTriangle className="h-8 w-8 text-amber-400" />,
    title: 'Risk Boundaries',
    description: 'Software cannot eliminate blockchain risk. FlashRoute provides tools and controls; operators retain responsibility.',
    bullets: [
      'Chain risk: software cannot prevent chain reorgs or forks',
      'Contract risk: audit FlashRoute contracts before trusting',
      'Market risk: competition affects all arbitrage participants',
      'Execution risk: gas volatility and network congestion impact results',
    ],
  },
];

export function SecurityPage() {
  return (
    <div className="space-y-20 py-12 lg:py-16">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Security and trust
        </h1>
        <p className="mx-auto max-w-2xl text-fx-text-secondary">
          Infrastructure built for operators who understand DeFi risk. Clear boundaries between FlashRoute tooling and your execution responsibility.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.id} className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                {section.icon}
              </div>
              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-fx-text-primary">{section.title}</h2>
                <p className="text-sm text-fx-text-secondary">{section.description}</p>
                <ul className="space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm text-fx-text-muted">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-cyan-400 flex-shrink-0" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <section className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-fx-text-primary">Important Risk Disclaimer</h3>
            <p className="mt-2 text-sm text-fx-text-secondary">
              While FlashRoute implements security best practices, no software can eliminate blockchain or DeFi risk. 
              Operators are responsible for understanding and accepting these risks. Please review our{' '}
              <Link to="/risk-disclosure" className="text-cyan-400 hover:underline">Risk Disclosure</Link> before using execution features.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap justify-center gap-4">
        <Button as={Link} to="/pricing" variant="secondary" size="lg">
          Review Pricing
        </Button>
        <Button as={Link} to="/contact-sales" variant="secondary" size="lg">
          Talk to Sales
        </Button>
      </section>
    </div>
  );
}
