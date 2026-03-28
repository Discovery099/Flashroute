import { Card } from '@flashroute/ui';

export function TermsPage() {
  return (
    <div className="space-y-8 py-12 lg:py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-fx-text-primary">Terms of Service</h1>
        <p className="text-sm text-fx-text-muted">Last updated: March 2026</p>
      </header>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">1. Service Scope</h2>
          <p className="text-fx-text-secondary">
            FlashRoute provides blockchain monitoring, analytics, and execution tooling services. FlashRoute helps operators 
            identify and execute arbitrage opportunities across decentralized exchanges. FlashRoute does not provide financial 
            advice, investment management, or guaranteed returns.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">2. Acceptable Use</h2>
          <p className="text-fx-text-secondary">
            You agree to use FlashRoute only for lawful purposes. You may not:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Use the service for illegal activities or money laundering</li>
            <li>Attempt to reverse engineer, modify, or interfere with FlashRoute infrastructure</li>
            <li>Use automated bots in violation of exchange or chain rules</li>
            <li>Attempt to manipulate markets or execute front-running strategies beyond permissible MEV</li>
            <li>Share your account credentials or API keys with unauthorized parties</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">3. Subscriptions and Billing</h2>
          <p className="text-fx-text-secondary">
            Subscription fees are billed monthly or annually in advance. Annual plans receive a discount. You authorize 
            FlashRoute to charge your payment method for subscription fees. Cancellation takes effect at the end of the 
            current billing period. No refunds are provided for partial periods.
          </p>
          <p className="text-fx-text-secondary">
            Free tier services are provided without warranty. FlashRoute reserves the right to modify or discontinue free 
            tier offerings at any time.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">4. Execution and Capital</h2>
          <p className="text-fx-text-secondary">
            You are solely responsible for managing your own wallet(s) and digital assets. FlashRoute does not hold, 
            custody, or control your funds. All execution transactions occur on-chain and are irreversible. You retain 
            full control over your private keys and wallet access.
          </p>
          <p className="text-fx-text-secondary">
            FlashRoute cannot guarantee that any identified opportunity will result in profitable execution. You acknowledge 
            that blockchain transactions are final and that losses may occur due to market conditions, execution quality, 
            gas costs, or other factors.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">5. Limitations of Liability</h2>
          <p className="text-fx-text-secondary">
            FlashRoute is provided "as is" without warranties of any kind. FlashRoute disclaims all warranties, express 
            or implied, including merchantability, fitness for a particular purpose, and non-infringement.
          </p>
          <p className="text-fx-text-secondary">
            FlashRoute is not liable for any indirect, incidental, special, consequential, or punitive damages, 
            including but not limited to loss of profits, loss of data, or cost of substitute services, arising out of 
            or related to your use of FlashRoute.
          </p>
          <p className="text-fx-text-secondary">
            FlashRoute's total liability for any claim arising from these Terms shall not exceed the amount you paid 
            FlashRoute in the twelve (12) months preceding the claim.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">6. No Investment Advice</h2>
          <p className="text-fx-text-secondary">
            FlashRoute does not provide investment, financial, or trading advice. Any information provided through 
            FlashRoute, including opportunity rankings, profit estimates, and analytics, is for informational 
            purposes only. You are solely responsible for your own trading and investment decisions.
          </p>
          <p className="text-fx-text-secondary">
            You acknowledge that cryptocurrency trading and arbitrage involve substantial risk of loss. Past 
            performance does not guarantee future results.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">7. Account Termination</h2>
          <p className="text-fx-text-secondary">
            FlashRoute may suspend or terminate your account at any time for violation of these Terms, suspected 
            fraud, illegal activity, or for any reason at FlashRoute's sole discretion. Upon termination, your 
            right to use FlashRoute immediately ceases.
          </p>
          <p className="text-fx-text-secondary">
            Data retention after termination is subject to our Privacy Policy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">8. Governing Law</h2>
          <p className="text-fx-text-secondary">
            These Terms are governed by the laws of the jurisdiction in which FlashRoute is established, without 
            regard to conflict of law principles. Any disputes arising from these Terms shall be resolved through 
            binding arbitration or in the courts of the applicable jurisdiction.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">9. Changes to Terms</h2>
          <p className="text-fx-text-secondary">
            FlashRoute reserves the right to modify these Terms at any time. Changes will be posted on this page 
            with an updated "Last revised" date. Continued use of FlashRoute after changes constitutes acceptance 
            of the modified Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">10. Contact</h2>
          <p className="text-fx-text-secondary">
            For questions about these Terms, contact us at legal@flashroute.io.
          </p>
        </section>
      </div>
    </div>
  );
}
