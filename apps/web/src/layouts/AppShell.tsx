import { Button, LiveIndicator } from '@flashroute/ui';
import { Bell, ChevronRight, KeyRound, LayoutDashboard, Menu, Settings2, Shield, TrendingUp, Wallet, Waves, CandlestickChart, Boxes, BarChart3, CreditCard, CircleUserRound } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';

import { useLiveStore } from '../state/live.store';
import { useUiStore } from '../state/ui.store';

type ShellNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  admin?: boolean;
};

const primaryNav: ShellNavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/opportunities', label: 'Opportunities', icon: TrendingUp },
  { to: '/strategies', label: 'Strategies', icon: CandlestickChart },
  { to: '/trades', label: 'Trades', icon: Waves },
  { to: '/pools', label: 'Pools', icon: Boxes },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/api-keys', label: 'API keys', icon: KeyRound },
  { to: '/admin/users', label: 'Admin users', icon: Shield, admin: true },
  { to: '/admin/system', label: 'Admin system', icon: Shield, admin: true },
];

export function AppShell({ children }: PropsWithChildren) {
  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleMobileNav = useUiStore((state) => state.toggleMobileNav);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const isDisconnected = connectionStatus !== 'connected';

  return (
    <div className="min-h-screen bg-fx-bg text-fx-text-primary">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_52%),radial-gradient(circle_at_70%_20%,_rgba(139,92,246,0.12),_transparent_34%)]" />
      <div className="relative flex min-h-screen">
        <aside
          data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
          className={[
            'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-fx-border bg-fx-surface/95 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0',
            sidebarCollapsed ? 'lg:w-24' : '',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-fx-border px-5 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">FlashRoute</p>
              <p className="mt-1 text-sm text-fx-text-secondary">Operator runtime</p>
            </div>
            <Button variant="ghost" size="sm" onClick={toggleSidebar} className="hidden lg:inline-flex">
              <ChevronRight className={sidebarCollapsed ? 'rotate-180' : ''} />
            </Button>
          </div>

          <nav aria-label="Primary" className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
            {primaryNav.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={mobileNavOpen ? toggleMobileNav : undefined}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition',
                      isActive
                        ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.15)]'
                        : 'border-transparent bg-transparent text-fx-text-secondary hover:border-fx-border-subtle hover:bg-fx-surface-strong hover:text-fx-text-primary',
                      sidebarCollapsed ? 'lg:justify-center lg:px-0' : '',
                    ].join(' ')
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
                  {item.admin && !sidebarCollapsed ? <Shield className="ml-auto h-4 w-4 text-fx-text-muted" /> : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="border-t border-fx-border px-4 py-4 text-xs text-fx-text-muted">
            <div className="rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4">
              <p className="uppercase tracking-[0.26em]">Runtime state</p>
              <div className="mt-3 flex items-center justify-between">
                <span>Ingress</span>
                <LiveIndicator status={connectionStatus === 'connected' ? 'connected' : connectionStatus === 'reconnecting' ? 'reconnecting' : connectionStatus === 'idle' ? 'polling' : 'disconnected'} />
              </div>
            </div>
          </div>
        </aside>

        {mobileNavOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={toggleMobileNav} /> : null}

        <div data-app-shell-content className={['flex min-h-screen flex-1 flex-col', sidebarCollapsed ? 'lg:pl-24' : 'lg:pl-72'].join(' ')}>
          <header className="sticky top-0 z-20 border-b border-fx-border bg-fx-bg/80 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <Button variant="ghost" size="sm" onClick={toggleMobileNav} className="lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.32em] text-fx-text-muted">Execution surface</p>
                <h1 className="truncate text-lg font-semibold text-fx-text-primary">FlashRoute console</h1>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="rounded-full border border-fx-border-subtle bg-fx-surface-strong px-3 py-2 text-xs font-medium text-fx-text-secondary">
                  Chain: All networks
                </div>
                <LiveIndicator status={connectionStatus === 'connected' ? 'connected' : connectionStatus === 'reconnecting' ? 'reconnecting' : connectionStatus === 'idle' ? 'polling' : 'disconnected'} />
                <Button variant="ghost" size="sm" aria-label="3 unread notifications" className="relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-semibold text-slate-950">
                    3
                  </span>
                </Button>
                <Button variant="ghost" size="sm" aria-label="Wallet status">
                  <Wallet className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="User menu">
                  <CircleUserRound className="h-4 w-4" />
                  <span className="text-xs font-medium text-fx-text-primary">Ops user</span>
                  <ChevronRight className="h-4 w-4 rotate-90" />
                </Button>
              </div>
            </div>
            {isDisconnected ? (
              <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:px-6 lg:px-8">
                Live updates paused. Falling back to background refresh.
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
