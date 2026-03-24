import { Button, Card, LiveIndicator, StatCard } from '@flashroute/ui';
import { Shield, Activity } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, Outlet, createBrowserRouter, useLocation, type RouteObject } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { OpportunitiesPage } from '@/features/opportunities/pages/OpportunitiesPage';
import { StrategyCreatePage } from '@/features/strategies/pages/StrategyCreatePage';
import { StrategyDetailPage } from '@/features/strategies/pages/StrategyDetailPage';
import { StrategyEditPage } from '@/features/strategies/pages/StrategyEditPage';
import { StrategyListPage } from '@/features/strategies/pages/StrategyListPage';
import { AppShell } from '../layouts/AppShell';
import { AuthLayout } from '../layouts/AuthLayout';
import { MarketingLayout } from '../layouts/MarketingLayout';
import { bootstrapAuthSession, useAuthStore } from '../state/auth.store';

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

function PlaceholderPage({ eyebrow, title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fx-text-muted">{eyebrow}</p>
          <div>
            <h1 className="text-2xl font-semibold text-fx-text-primary">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-fx-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button as={Link} to="/trades" variant="secondary">Review queue</Button>
          <Button as={Link} to="/dashboard">Open console</Button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net spread" value="+$18.4k" delta="+4.2%" comparisonLabel="vs last hour" tone="positive" />
        <StatCard label="Queue depth" value="126" delta="-8" comparisonLabel="routes pending" tone="warning" />
        <StatCard label="Strategy uptime" value="99.94%" delta="+0.1%" comparisonLabel="rolling 7d" />
        <StatCard label="Median latency" value="182ms" delta="-24ms" comparisonLabel="submit path" tone="positive" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card
          title="Execution surface"
          subtitle="Dense placeholder content keeps route scaffolding realistic without implementing feature logic yet."
          action={<LiveIndicator status="reconnecting" />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {[
              'Opportunity ingestion is staged for query-backed snapshots and socket patches.',
              'Table-heavy pages will inherit this shell and token system without bespoke wrappers.',
              'Protected route bootstrap remains centralized so auth work can land without shell churn.',
              'Cards preserve numeric hierarchy with mono metrics and muted operator copy.',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4 text-sm text-fx-text-secondary">
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Route readiness" subtitle="Major navigation skeletons are mounted now for phased delivery.">
          <div className="space-y-3 text-sm text-fx-text-secondary">
            <div className="flex items-center justify-between rounded-2xl border border-fx-border-subtle bg-fx-surface/80 px-4 py-3">
              <span>Live infra</span>
              <LiveIndicator status="polling" />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">
              <span>Shell foundation</span>
              <span className="font-mono text-xs">READY</span>
            </div>
            <div className="rounded-2xl border border-fx-border-subtle bg-fx-surface/80 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-fx-text-muted">Next phase hooks</p>
              <p className="mt-2">Auth guards, queries, and page modules can slot into the existing route tree.</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function MarketingHome() {
  return (
    <div className="space-y-10 py-8 lg:py-14">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-200">
            <Activity className="h-3.5 w-3.5" />
            FlashRoute operator console
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fx-text-primary md:text-5xl">
              Real-time route intelligence for execution teams running volatile on-chain flow.
            </h1>
            <p className="max-w-2xl text-base text-fx-text-secondary md:text-lg">
              Dark-first infrastructure, rapid live-state awareness, and precise operator tooling for profitable routing decisions.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button as={Link} to="/register" size="lg">Request access</Button>
            <Button as={Link} to="/dashboard" variant="secondary" size="lg">View architecture</Button>
          </div>
        </div>

        <Card title="System pulse" subtitle="Marketing pages already reuse the same visual language as protected product surfaces.">
          <div className="space-y-4">
            <StatCard label="Tracked venues" value="42" delta="+6" comparisonLabel="active connectors" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Signal health</p>
                <p className="mt-3 font-mono text-2xl text-fx-text-primary">98.7%</p>
              </div>
              <div className="rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Live status</p>
                <div className="mt-3">
                  <LiveIndicator status="connected" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

export function SessionResolutionScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fx-bg px-6 text-fx-text-primary">
      <div className="w-full max-w-md rounded-3xl border border-fx-border bg-fx-surface/95 p-8 shadow-panel">
        <p className="text-xs uppercase tracking-[0.28em] text-fx-text-muted">Session bootstrap</p>
        <h1 className="mt-4 text-2xl font-semibold">Checking your FlashRoute session...</h1>
        <p className="mt-3 text-sm text-fx-text-secondary">We are resolving access before rendering the next route.</p>
      </div>
    </div>
  );
}

function useSessionBootstrap() {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);

  useEffect(() => {
    if (isBootstrapping) {
      void bootstrapAuthSession();
    }
  }, [isBootstrapping]);

  return {
    isBootstrapping,
    isAuthenticated: useAuthStore((state) => state.isAuthenticated),
  };
}

function LoginRedirect({ redirectTo }: { redirectTo: string }) {
  const setPostLoginRedirect = useAuthStore((state) => state.setPostLoginRedirect);

  useEffect(() => {
    setPostLoginRedirect(redirectTo);
  }, [redirectTo, setPostLoginRedirect]);

  return <Navigate to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
}

export function ProtectedRouteFrame() {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useSessionBootstrap();

  if (isBootstrapping) {
    return <SessionResolutionScreen />;
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;
    return <LoginRedirect redirectTo={redirectTo} />;
  }

  return <AppShell><Outlet /></AppShell>;
}

export function PublicAuthPage({ children, allowWhenAuthenticated = false }: { children: ReactNode; allowWhenAuthenticated?: boolean }) {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useSessionBootstrap();
  const allowAuthenticatedAccess = allowWhenAuthenticated && location.search.includes('token=');

  if (isBootstrapping) {
    return <SessionResolutionScreen />;
  }

  if (isAuthenticated && !allowAuthenticatedAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AdminRouteFrame() {
  return <Outlet />;
}

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <MarketingLayout />,
    children: [
      { index: true, element: <MarketingHome /> },
      {
        path: 'pricing',
        element: (
          <PlaceholderPage
            eyebrow="Marketing"
            title="Pricing"
            description="Plan scaffolding is available now so billing routes can later connect to entitlement-aware UI flows."
          />
        ),
      },
      {
        path: 'contact',
        element: (
          <PlaceholderPage
            eyebrow="Marketing"
            title="Operator onboarding"
            description="Public funnels stay visually aligned with the trading console while keeping protected product routes isolated."
          />
        ),
      },
    ],
  },
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: 'auth', element: <Navigate to="/login" replace /> },
      { path: 'auth/login', element: <Navigate to="/login" replace /> },
      { path: 'auth/register', element: <Navigate to="/register" replace /> },
      { path: 'auth/forgot-password', element: <Navigate to="/forgot-password" replace /> },
      { path: 'login', element: <PublicAuthPage><LoginPage /></PublicAuthPage> },
      { path: 'register', element: <PublicAuthPage><RegisterPage /></PublicAuthPage> },
      { path: 'forgot-password', element: <PublicAuthPage><ForgotPasswordPage /></PublicAuthPage> },
      { path: 'reset-password', element: <PublicAuthPage allowWhenAuthenticated><ResetPasswordPage /></PublicAuthPage> },
      { path: 'verify-email', element: <PublicAuthPage allowWhenAuthenticated><VerifyEmailPage /></PublicAuthPage> },
    ],
  },
  {
    path: '/',
    element: <ProtectedRouteFrame />,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'opportunities', element: <OpportunitiesPage /> },
      { path: 'strategies', element: <StrategyListPage /> },
      { path: 'strategies/new', element: <StrategyCreatePage /> },
      { path: 'strategies/:id', element: <StrategyDetailPage /> },
      { path: 'strategies/:id/edit', element: <StrategyEditPage /> },
      { path: 'trades', element: <PlaceholderPage eyebrow="Execution" title="Trades" description="Trade review routes are reserved with dense placeholder structure rather than empty stubs." /> },
      { path: 'pools', element: <PlaceholderPage eyebrow="Liquidity" title="Pools" description="Pool monitoring scaffolding is mounted now so liquidity health and routing surfaces can land without shell changes." /> },
      { path: 'analytics', element: <PlaceholderPage eyebrow="Analytics" title="Analytics" description="Chart-heavy routes can opt into full-width content while preserving shared shell affordances." /> },
      { path: 'settings', element: <PlaceholderPage eyebrow="Workspace" title="Settings" description="Account, API, and environment preferences will inherit the same state and token foundation." /> },
      { path: 'billing', element: <PlaceholderPage eyebrow="Workspace" title="Billing" description="Billing and entitlement routes are scaffolded so plan-aware UI can land without route churn." /> },
      { path: 'api-keys', element: <PlaceholderPage eyebrow="Workspace" title="API keys" description="API key management gets a reserved product route now for later auth-aware provisioning and audit work." /> },
      {
        path: 'admin',
        element: <AdminRouteFrame />,
        children: [
          { index: true, element: <Navigate to="/admin/users" replace /> },
          { path: 'users', element: <PlaceholderPage eyebrow="Admin" title="User administration" description="User management scaffolding is isolated behind the admin route group for later role gating." /> },
          { path: 'system', element: <PlaceholderPage eyebrow="Admin" title="System health" description="Operational telemetry, queue health, and controls will mount here with admin-only data policies." /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: (
      <div className="min-h-screen bg-fx-bg px-6 py-16 text-fx-text-primary">
        <div className="mx-auto max-w-xl rounded-3xl border border-fx-border bg-fx-surface p-8 shadow-panel">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-200">
            <Shield className="h-3.5 w-3.5" />
            Route unavailable
          </div>
          <h1 className="mt-6 text-3xl font-semibold">Nothing is mounted at this route yet.</h1>
          <p className="mt-3 text-sm text-fx-text-secondary">The shell stays in place, but this path is reserved for a later phase.</p>
          <div className="mt-6 flex gap-3">
            <Button as={Link} to="/dashboard">Return to dashboard</Button>
            <Button as={Link} to="/" variant="secondary">Go to marketing</Button>
          </div>
        </div>
      </div>
    ),
  },
];

export const createAppRouter = () => createBrowserRouter(appRoutes);

export const router = createAppRouter();
