import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@flashroute/ui';

const FAQ_DATA = [
  {
    question: 'What chains and DEXes are supported?',
    answer: 'FlashRoute supports Ethereum mainnet, Arbitrum One, and Base. Supported DEXes include Uniswap V2/V3, SushiSwap, Curve, and Balancer. Additional DEXes and chains are planned for future releases.',
  },
  {
    question: 'Does FlashRoute guarantee profitable trades?',
    answer: 'No. FlashRoute provides monitoring, simulation, and execution tooling. Profitability depends on market conditions, gas costs, execution quality, and competition from other arbitrageurs. Past performance does not guarantee future results.',
  },
  {
    question: 'Do I need my own capital?',
    answer: 'Yes. FlashRoute does not provide capital. You need your own funds in your wallet to execute arbitrage routes. FlashRoute helps identify profitable opportunities and can execute trades on your behalf, but you must fund your execution wallet.',
  },
  {
    question: 'How are flash loans sourced?',
    answer: 'FlashRoute integrates with major flash loan providers including Aave, dYdX, and others. The system selects the optimal provider based on route requirements, available liquidity, and gas efficiency.',
  },
  {
    question: 'What happens if gas spikes or a route becomes stale?',
    answer: 'FlashRoute enforces configurable gas ceilings and route expiration handling. If gas exceeds your threshold or a pool state changes significantly, routes are automatically aborted. The system continuously monitors and re-evaluates conditions before and during execution.',
  },
  {
    question: 'Can I use the platform for monitoring and not execution?',
    answer: 'Yes. The Monitor tier provides historical analytics and opportunity discovery without automated execution. You can also pause execution at any time and operate in watch-only mode.',
  },
  {
    question: 'How does private bundle submission work?',
    answer: 'FlashRoute submits transactions through Flashbots MEV-Protect, which keeps transactions private until inclusion in a block. This reduces (but does not eliminate) frontrunning risk. Private submission is available on Executor and Institutional tiers.',
  },
  {
    question: 'What subscription tier includes automated execution?',
    answer: 'Automated execution is available on Executor and Institutional tiers. Monitor and Trader tiers provide monitoring and signals only. See the pricing page for full feature comparison.',
  },
  {
    question: 'Can teams share access?',
    answer: 'Yes, on higher tiers. Executor supports up to 3 team seats, and Institutional supports custom seat limits. Each seat has configurable permissions (viewer, operator, admin).',
  },
  {
    question: 'Is there an API?',
    answer: 'API access is available on the Institutional tier with "Execute" access level. This allows programmatic access to opportunities, signals, and execution management. Monitor and Trader tiers do not include API access.',
  },
  {
    question: 'What data does the dashboard store?',
    answer: 'FlashRoute stores your account information, strategy configurations, execution history, and analytics data. Wallet addresses are stored for session management. Private keys are never stored. See our Privacy Policy for full details.',
  },
  {
    question: 'How do alerts work?',
    answer: 'You can configure alerts for specific opportunity conditions (e.g., profit above threshold, specific pairs, chain). Alerts can be delivered via dashboard notifications, email, or webhook. Alert limits vary by tier.',
  },
];

export function FAQPage() {
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filteredFAQs = FAQ_DATA.filter(
    (faq) =>
      search === '' ||
      faq.question.toLowerCase().includes(search.toLowerCase()) ||
      faq.answer.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-12 py-12 lg:py-16">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Frequently Asked Questions
        </h1>
        <p className="mx-auto max-w-2xl text-fx-text-secondary">
          Common questions about FlashRoute capabilities, pricing, and risk.
        </p>
      </section>

      <section className="mx-auto max-w-3xl space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fx-text-muted" />
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-fx-border bg-fx-surface px-12 py-3 text-fx-text-primary placeholder:text-fx-text-muted focus:border-cyan-400/60 focus:outline-none"
          />
        </div>

        <div className="space-y-3">
          {filteredFAQs.map((faq, index) => (
            <Card key={index} className="overflow-hidden">
              <button
                type="button"
                onClick={() => handleToggle(index)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <span className="font-medium text-fx-text-primary">{faq.question}</span>
                <ChevronDown
                  className={`h-5 w-5 text-fx-text-muted transition-transform ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="border-t border-fx-border px-5 pb-5 pt-3">
                  <p className="text-sm text-fx-text-secondary">{faq.answer}</p>
                </div>
              )}
            </Card>
          ))}
        </div>

        {filteredFAQs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-fx-text-muted">No questions found matching your search.</p>
          </div>
        )}
      </section>

      <section className="text-center">
        <p className="text-fx-text-secondary">
          Still have questions?{' '}
          <Link to="/contact-sales" className="text-cyan-400 hover:underline">
            Contact our team
          </Link>
        </p>
      </section>
    </div>
  );
}
