import { ArrowRight, Menu, ShieldCheck, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '@flashroute/ui';

const NAV_LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/security', label: 'Security' },
  { to: '/docs-preview', label: 'Docs Preview' },
  { to: '/faq', label: 'FAQ' },
];

const FOOTER_LINKS = {
  product: [
    { to: '/features', label: 'Features' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/docs-preview', label: 'Docs Preview' },
  ],
  useCases: [
    { to: '/case-studies', label: 'Solo Operators' },
    { to: '/case-studies', label: 'Traders' },
    { to: '/case-studies', label: 'Funds' },
  ],
  company: [
    { to: '/security', label: 'Security' },
    { to: '/contact-sales', label: 'Contact Sales' },
    { to: '/faq', label: 'FAQ' },
  ],
  legal: [
    { to: '/terms', label: 'Terms' },
    { to: '/privacy', label: 'Privacy' },
    { to: '/risk-disclosure', label: 'Risk Disclosure' },
  ],
};

export function MarketingLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-gray-950 text-fx-text-primary">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-96 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_48%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.12),_transparent_32%)]" />

      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-fx-border bg-gray-950/90 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-fx-text-primary">FlashRoute</p>
              <p className="text-xs text-fx-text-muted">Execution intelligence</p>
            </div>
          </NavLink>

          <nav className="hidden items-center gap-6 text-sm text-fx-text-secondary md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `transition-colors hover:text-fx-text-primary ${
                    isActive ? 'text-cyan-400' : ''
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button as={NavLink} to="/login" variant="ghost" size="sm">
              Sign in
            </Button>
            <Button as={NavLink} to="/register" size="sm">
              Start Monitoring
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <button
            type="button"
            className="rounded-lg p-2 text-fx-text-secondary hover:bg-fx-surface hover:text-fx-text-primary md:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-gray-950 border-l border-fx-border shadow-panel">
            <div className="flex items-center justify-between p-4 border-b border-fx-border">
              <NavLink to="/" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-fx-text-primary">FlashRoute</p>
              </NavLink>
              <button
                type="button"
                className="rounded-lg p-2 text-fx-text-secondary hover:bg-fx-surface hover:text-fx-text-primary"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 p-4">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `rounded-lg px-4 py-3 text-base transition-colors ${
                      isActive ? 'bg-fx-surface text-cyan-400' : 'text-fx-text-secondary hover:bg-fx-surface hover:text-fx-text-primary'
                    }`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex flex-col gap-3 border-t border-fx-border p-4">
              <Button as={NavLink} to="/login" variant="ghost" className="w-full justify-center" onClick={() => setMobileMenuOpen(false)}>
                Sign in
              </Button>
              <Button as={NavLink} to="/register" className="w-full justify-center" onClick={() => setMobileMenuOpen(false)}>
                Start Monitoring
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-24 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-fx-border bg-gray-950/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-fx-text-primary">FlashRoute</p>
              </div>
              <p className="text-xs text-fx-text-muted max-w-xs">
                Execution intelligence for serious DeFi operators.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-fx-text-muted mb-3">Product</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.product.map((link) => (
                  <li key={link.label}>
                    <NavLink to={link.to} className="text-sm text-fx-text-secondary hover:text-cyan-400 transition-colors">
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-fx-text-muted mb-3">Use Cases</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.useCases.map((link) => (
                  <li key={link.label}>
                    <NavLink to={link.to} className="text-sm text-fx-text-secondary hover:text-cyan-400 transition-colors">
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-fx-text-muted mb-3">Legal</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.legal.map((link) => (
                  <li key={link.label}>
                    <NavLink to={link.to} className="text-sm text-fx-text-secondary hover:text-cyan-400 transition-colors">
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-fx-border pt-8">
            <p className="text-xs text-fx-text-muted text-center max-w-3xl mx-auto">
              FlashRoute provides monitoring, analytics, and execution tooling. Profitability depends on market conditions, competition, gas costs, and execution success. Past performance does not guarantee future results.
            </p>

            <div className="mt-6 flex items-center justify-center gap-6">
              <a href="#" className="text-fx-text-muted hover:text-cyan-400 transition-colors text-xs">Twitter/X</a>
              <a href="#" className="text-fx-text-muted hover:text-cyan-400 transition-colors text-xs">GitHub</a>
              <a href="#" className="text-fx-text-muted hover:text-cyan-400 transition-colors text-xs">Discord</a>
            </div>

            <p className="text-xs text-fx-text-muted text-center mt-4">
              &copy; {new Date().getFullYear()} FlashRoute. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
