import { LockKeyhole } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-fx-bg px-4 py-6 text-fx-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-between">
        <div className="space-y-8">
          <div className="space-y-5 pt-4 text-center sm:pt-8">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <Link className="inline-flex items-center justify-center text-sm font-semibold uppercase tracking-[0.34em] text-fx-text-primary" to="/">
                FlashRoute
              </Link>
              <p className="text-sm text-fx-text-secondary">Flash-loan arbitrage intelligence and execution</p>
            </div>
          </div>
          <Outlet />
        </div>

        <footer className="mt-8 flex flex-col items-center justify-between gap-3 pb-2 text-xs text-fx-text-muted sm:flex-row">
          <span>© 2026 FlashRoute</span>
          <div className="flex items-center gap-4">
            <Link className="hover:text-fx-text-primary" to="/contact">Privacy</Link>
            <Link className="hover:text-fx-text-primary" to="/pricing">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
