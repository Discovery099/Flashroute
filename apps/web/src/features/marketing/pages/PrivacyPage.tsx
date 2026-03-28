export function PrivacyPage() {
  return (
    <div className="space-y-8 py-12 lg:py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-fx-text-primary">Privacy Policy</h1>
        <p className="text-sm text-fx-text-muted">Last updated: March 2026</p>
      </header>

      <div className="space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">1. Information We Collect</h2>
          <p className="text-fx-text-secondary">
            FlashRoute collects information you provide directly, information about your use of our services, 
            and information from blockchain sources to provide monitoring and analytics.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">2. Account and Authentication Data</h2>
          <p className="text-fx-text-secondary">
            When you create an account, we collect:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Email address</li>
            <li>Password (hashed, never stored in plaintext)</li>
            <li>Wallet addresses you connect (for display purposes only)</li>
            <li>API keys you generate (stored encrypted)</li>
            <li>Billing information (processed by Stripe, not stored by FlashRoute)</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">3. Usage and Analytics Data</h2>
          <p className="text-fx-text-secondary">
            We collect operational data to improve FlashRoute:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Strategy configurations and execution settings</li>
            <li>Trade history and execution results</li>
            <li>Opportunity interactions and alerts</li>
            <li>API usage patterns (for rate limiting and billing)</li>
            <li>Device and browser information for service optimization</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">4. Blockchain Data</h2>
          <p className="text-fx-text-secondary">
            FlashRoute indexes public blockchain data to provide services. This includes:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Transaction data involving connected wallet addresses</li>
            <li>DEX pool reserves and historical states</li>
            <li>Gas prices and network conditions</li>
            <li>Contract interaction logs</li>
          </ul>
          <p className="text-fx-text-secondary">
            This data is collected from public blockchain sources and is not subject to deletion requests.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">5. Cookies and Tracking</h2>
          <p className="text-fx-text-secondary">
            FlashRoute uses essential cookies for authentication and session management. We also use analytics 
            tools to understand service usage patterns. You may disable non-essential cookies through your 
            browser settings, though this may affect functionality.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">6. Data Sharing</h2>
          <p className="text-fx-text-secondary">
            FlashRoute does not sell your personal information. We share data only in these circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>With service providers (hosting, analytics, email) under confidentiality agreements</li>
            <li>With Stripe for billing (subject to Stripe's privacy policy)</li>
            <li>When required by law, court order, or government request</li>
            <li>To protect FlashRoute rights, safety, or property</li>
            <li>With your explicit consent</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">7. Data Retention</h2>
          <p className="text-fx-text-secondary">
            We retain your data as follows:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Account data: Until account deletion, plus 30 days</li>
            <li>Trade history: 2 years from execution</li>
            <li>Strategy configurations: Until account deletion</li>
            <li>Analytics aggregates: Anonymized indefinitely</li>
            <li>API logs: 90 days</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">8. Security</h2>
          <p className="text-fx-text-secondary">
            FlashRoute implements industry-standard security measures including encryption in transit and at rest, 
            regular security audits, access controls, and employee security training. No system is completely 
            secure; we encourage responsible security practices on your end as well.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">9. Your Rights</h2>
          <p className="text-fx-text-secondary">
            Depending on your jurisdiction, you may have rights to:
          </p>
          <ul className="list-disc list-inside space-y-2 text-fx-text-secondary">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and associated data</li>
            <li>Export your data in a portable format</li>
            <li>Object to certain processing activities</li>
          </ul>
          <p className="text-fx-text-secondary">
            To exercise these rights, use the account settings or contact privacy@flashroute.io.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">10. Changes to Policy</h2>
          <p className="text-fx-text-secondary">
            We may update this Privacy Policy periodically. Changes will be posted on this page with an 
            updated date. We encourage you to review this policy regularly.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-fx-text-primary">11. Contact</h2>
          <p className="text-fx-text-secondary">
            For privacy-related questions, contact privacy@flashroute.io.
          </p>
        </section>
      </div>
    </div>
  );
}
