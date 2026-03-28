import { AlertTriangle, Shield } from 'lucide-react';

import { Card } from '@flashroute/ui';

export function RiskDisclosurePage() {
  return (
    <div className="space-y-8 py-12 lg:py-16">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200">
          <AlertTriangle className="h-4 w-4" />
          Required Reading
        </div>
        <h1 className="text-3xl font-semibold text-fx-text-primary">Risk Disclosure</h1>
        <p className="text-sm text-fx-text-muted">Last updated: March 2026</p>
      </header>

      <div className="rounded-2xl border-2 border-red-400/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-4">
          <Shield className="h-8 w-8 text-red-400 flex-shrink-0" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-fx-text-primary">No Guarantee of Profit</h2>
            <p className="text-fx-text-primary font-medium">
              FlashRoute does not guarantee any profit or return on investment. 
              Past performance does not indicate future results. Cryptocurrency arbitrage 
              involves substantial risk of loss.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">1. DeFi Smart Contract Risk</h2>
          <p className="text-fx-text-secondary">
            FlashRoute interfaces with decentralized finance protocols deployed on public blockchains. 
            These smart contracts have known and unknown vulnerabilities. Even audited contracts can 
            contain exploits that result in total loss of funds. You acknowledge that:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Smart contracts may contain bugs, exploits, or logic errors</li>
            <li>FlashRoute cannot be held liable for losses due to contract vulnerabilities</li>
            <li>You should conduct your own due diligence before interacting with any DeFi protocol</li>
            <li>Emergency circuit breakers in protocols may not function as expected</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">2. Flash Loan Availability Risk</h2>
          <p className="text-fx-text-secondary">
            Flash loans are a core component of arbitrage strategies. Flash loan availability is not guaranteed:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Protocols may restrict flash loan access without notice</li>
            <li>Market conditions can prevent flash loan execution</li>
            <li>Flash loan fees may make previously profitable routes unprofitable</li>
            <li>Flash loan providers may implement rate limits or other restrictions</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">3. Validator, Builder, and Mempool Competition Risk</h2>
          <p className="text-fx-text-secondary">
            FlashRoute uses Flashbots MEV-Protect and similar services to reduce frontrunning risk. 
            However, these services do not eliminate all execution risk:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Validators and block builders have full control over transaction ordering</li>
            <li>Other sophisticated traders may identify and front-run the same opportunities</li>
            <li>Private mempool services may experience delays or failures</li>
            <li>Transaction inclusion is never guaranteed even with private submission</li>
            <li>Some opportunities may be competed away before your transaction executes</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">4. Chain Reorganization Risk</h2>
          <p className="text-fx-text-secondary">
            Blockchain reorganizations (reorgs) can invalidate confirmed transactions:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Even confirmed transactions can be reversed during a reorg</li>
            <li>Deep reorgs can result in loss of funds if executed positions are invalidated</li>
            <li>Reorgs may occur due to network congestion, attacks, or protocol upgrades</li>
            <li>FlashRoute cannot prevent or mitigate chain reorganizations</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">5. Gas Volatility</h2>
          <p className="text-fx-text-secondary">
            Ethereum and other chains have variable gas costs that can change rapidly:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Gas prices can spike without warning during network congestion</li>
            <li>High gas costs can eliminate profit margins on small opportunities</li>
            <li>Failed transactions still consume gas ("gas war" scenarios)</li>
            <li>FlashRoute estimated gas may differ significantly from actual gas consumed</li>
            <li>Priority fees for expedited inclusion can substantially increase costs</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">6. Slippage and Stale State Risk</h2>
          <p className="text-fx-text-secondary">
            Opportunity data and pool states can become stale between simulation and execution:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Pool reserves may change between opportunity identification and execution</li>
            <li>Multi-hop routes require simultaneous pool access; sandwich attacks can alter outcomes</li>
            <li>Pending transactions can dramatically change expected execution prices</li>
            <li>FlashRoute simulations assume ideal execution conditions that may not occur</li>
            <li>Large trades can move market prices, reducing or eliminating expected profit</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">7. Market and Competition Risk</h2>
          <p className="text-fx-text-secondary">
            Cryptocurrency arbitrage is a competitive space with sophisticated participants:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Other arbitrageurs may identify and execute the same opportunities faster</li>
            <li>Institutional traders with better infrastructure may consistently outcompete retail</li>
            <li>Market conditions can shift rapidly, making previously profitable routes unprofitable</li>
            <li>Liquidity can evaporate during volatile periods, preventing route completion</li>
            <li> whale activity can move markets against established positions</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">8. Operator Responsibility</h2>
          <p className="text-fx-text-secondary">
            You are solely responsible for:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Understanding the risks associated with DeFi arbitrage</li>
            <li>Configuring appropriate risk parameters (gas limits, profit thresholds)</li>
            <li>Monitoring your positions and strategy performance</li>
            <li>Ensuring your wallet security and private key protection</li>
            <li>Complying with applicable laws and regulations in your jurisdiction</li>
            <li>Making informed decisions about capital allocation and risk tolerance</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">9. Prohibition on Deceptive Claims</h2>
          <p className="text-fx-text-secondary">
            FlashRoute prohibits the use of its services for any marketing or communications that make 
            misleading claims about guaranteed profits. Any past results, testimonials, or case 
            studies published by FlashRoute are for informational purposes only and do not constitute:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Guarantees of future performance</li>
            <li>Promises of specific profit levels</li>
            <li>Investment advice or recommendations</li>
            <li>Representation that all users will achieve similar results</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">10. Risk Acknowledgment</h2>
          <p className="text-fx-text-secondary">
            By using FlashRoute, you acknowledge that you have read, understood, and accepted the risks 
            described in this disclosure. You confirm that you:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Understand that losses can occur and may be significant</li>
            <li>Have adequate technical knowledge of DeFi and blockchain operations</li>
            <li>Can afford to lose the capital you deploy through FlashRoute</li>
            <li>Are solely responsible for your use of FlashRoute services</li>
            <li>Will not hold FlashRoute liable for any losses you incur</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">11. Additional Resources</h2>
          <p className="text-fx-text-secondary">
            We encourage you to educate yourself about DeFi risks:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Review the documentation for each DeFi protocol you interact with</li>
            <li>Understand smart contract audit reports before providing liquidity</li>
            <li>Start with small capital amounts to learn before scaling</li>
            <li>Consult with qualified financial advisors if needed</li>
          </ul>
        </section>

        <section className="space-y-4">
          <p className="text-sm text-fx-text-muted">
            This Risk Disclosure is incorporated by reference into the FlashRoute Terms of Service. 
            If you have questions about these risks, please contact support before using execution features.
          </p>
        </section>
      </div>
    </div>
  );
}
