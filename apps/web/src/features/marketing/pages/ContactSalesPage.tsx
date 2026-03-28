import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';

import { Button, Card } from '@flashroute/ui';

const TEAM_SIZES = ['1', '2-5', '6-20', '21+'];
const TRADE_VOLUMES = ['Exploratory', '<$1M', '$1M-$10M', '$10M+'];
const PRIMARY_NEEDS = [
  'Analytics',
  'API Access',
  'Automated Execution',
  'Multi-user Access',
  'Custom Infrastructure',
];

export function ContactSalesPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    tradeVolume: '',
    primaryNeeds: [] as string[],
    notes: '',
    honeypot: '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (formData.honeypot) return;
    setSubmitted(true);
  };

  const handleNeedToggle = (need: string) => {
    setFormData((prev) => ({
      ...prev,
      primaryNeeds: prev.primaryNeeds.includes(need)
        ? prev.primaryNeeds.filter((n) => n !== need)
        : [...prev.primaryNeeds, need],
    }));
  };

  if (submitted) {
    return (
      <div className="space-y-8 py-12 lg:py-16">
        <section className="mx-auto max-w-xl space-y-6 text-center">
          <div className="flex justify-center">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 p-4">
              <CheckCircle className="h-12 w-12 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-fx-text-primary">Thank you for reaching out</h1>
          <p className="text-fx-text-secondary">
            Our team will review your inquiry and respond within 1-2 business days. If you have urgent questions, email us directly.
          </p>
          <Button as="a" href="/" variant="secondary">
            Return to Homepage
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-12 py-12 lg:py-16">
      <section className="mx-auto max-w-2xl space-y-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
          Talk to Sales
        </h1>
        <p className="text-fx-text-secondary">
          Interested in Institutional pricing, custom deployments, or enterprise features? Tell us about your needs.
        </p>
      </section>

      <section className="mx-auto max-w-xl">
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary placeholder:text-fx-text-muted focus:border-cyan-400/60 focus:outline-none"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Work Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary placeholder:text-fx-text-muted focus:border-cyan-400/60 focus:outline-none"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="company" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Company / Desk
                </label>
                <input
                  id="company"
                  type="text"
                  minLength={2}
                  maxLength={100}
                  value={formData.company}
                  onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary placeholder:text-fx-text-muted focus:border-cyan-400/60 focus:outline-none"
                  placeholder="Company or trading desk name"
                />
              </div>

              <div>
                <label htmlFor="teamSize" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Team Size
                </label>
                <select
                  id="teamSize"
                  value={formData.teamSize}
                  onChange={(e) => setFormData((prev) => ({ ...prev, teamSize: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary focus:border-cyan-400/60 focus:outline-none"
                >
                  <option value="">Select team size</option>
                  {TEAM_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tradeVolume" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Monthly Trade Volume Intent
                </label>
                <select
                  id="tradeVolume"
                  value={formData.tradeVolume}
                  onChange={(e) => setFormData((prev) => ({ ...prev, tradeVolume: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary focus:border-cyan-400/60 focus:outline-none"
                >
                  <option value="">Select trade volume</option>
                  {TRADE_VOLUMES.map((volume) => (
                    <option key={volume} value={volume}>{volume}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-fx-text-primary mb-2">
                  Primary Need
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRIMARY_NEEDS.map((need) => (
                    <button
                      key={need}
                      type="button"
                      onClick={() => handleNeedToggle(need)}
                      className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                        formData.primaryNeeds.includes(need)
                          ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                          : 'border-fx-border text-fx-text-secondary hover:border-cyan-400/40'
                      }`}
                    >
                      {need}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-fx-text-primary mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={4}
                  maxLength={2000}
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-xl border border-fx-border bg-fx-bg px-4 py-3 text-fx-text-primary placeholder:text-fx-text-muted focus:border-cyan-400/60 focus:outline-none resize-none"
                  placeholder="Tell us more about your use case..."
                />
                <p className="mt-1 text-xs text-fx-text-muted">
                  {formData.notes.length}/2000 characters
                </p>
              </div>

              <input
                type="text"
                name="website"
                value={formData.honeypot}
                onChange={(e) => setFormData((prev) => ({ ...prev, honeypot: e.target.value }))}
                className="absolute -left-full h-0 w-0 opacity-0"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <Button type="submit" size="lg" className="w-full">
              Submit Inquiry
              <ArrowRight className="h-5 w-5" />
            </Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
