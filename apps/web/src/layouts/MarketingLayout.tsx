import { ArrowRight, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '@flashroute/ui';

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-fx-bg text-fx-text-primary">
      <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_48%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.12),_transparent_32%)]" />
      <div className="relative">
        <header className="border-b border-fx-border bg-fx-bg/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <NavLink to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.26em]">FlashRoute</p>
                <p className="text-xs text-fx-text-muted">Execution intelligence</p>
              </div>
            </NavLink>

            <nav className="hidden items-center gap-6 text-sm text-fx-text-secondary md:flex">
              <NavLink to="/pricing">Pricing</NavLink>
              <NavLink to="/contact">Contact</NavLink>
              <NavLink to="/dashboard">Product</NavLink>
            </nav>

            <div className="flex items-center gap-3">
              <Button as={NavLink} to="/auth/login" variant="ghost">Sign in</Button>
              <Button as={NavLink} to="/auth/register">
                Request access
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
