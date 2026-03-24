import { Card, LiveIndicator, StatCard } from '@flashroute/ui';
import { RefreshCcw, TrendingUp, WalletCards, Activity, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getDashboard, type DashboardPeriod } from '../api';
import { toWebSocketUrl } from '@/lib/api';
import { useAuthStore } from '@/state/auth.store';
import { useLiveStore } from '@/state/live.store';

const PERIODS: DashboardPeriod[] = ['7d', '30d', '90d'];
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const chainLabel = (chainId: number) => {
  if (chainId === 1) return 'Ethereum';
  if (chainId === 42161) return 'Arbitrum';
  if (chainId === 10) return 'Optimism';
  if (chainId === 137) return 'Polygon';
  return `Chain ${chainId}`;
};

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} data-testid="dashboard-stat-skeleton" className="h-40 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
        ))}
      </div>
      <div data-testid="dashboard-chart-skeleton" className="h-80 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
      <div data-testid="dashboard-trades-skeleton" className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
    </div>
  );
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  const setConnectionStatus = useLiveStore((state) => state.setConnectionStatus);
  const recordMessageReceived = useLiveStore((state) => state.recordMessageReceived);
  const period = (searchParams.get('period') as DashboardPeriod | null) ?? '7d';
  const chainIdParam = searchParams.get('chainId');
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const connectionIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', { period, chainId }],
    queryFn: () => getDashboard(period, chainId),
    staleTime: 15_000,
    refetchInterval: connectionStatus === 'connected' ? false : 15_000,
  });

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    const scheduleReconnect = () => {
      if (!active) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      const baseDelay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
      const delay = baseDelay + Math.round(baseDelay * Math.random());
      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      setConnectionStatus(connectionIdRef.current ? 'reconnecting' : 'connecting');
      const socket = new WebSocket(
        toWebSocketUrl('/ws', accessToken, {
          resumeConnectionId: connectionIdRef.current,
        }),
      );

      socket.addEventListener('message', (event) => {
        if (!active) {
          return;
        }

        const payload = JSON.parse(String(event.data)) as {
          type: string;
          channel?: string;
          data?: Record<string, unknown> & { connectionId?: string };
        };

        recordMessageReceived();

        if (payload.type === 'connected') {
          connectionIdRef.current = payload.data?.connectionId ?? connectionIdRef.current;
          reconnectAttemptRef.current = 0;
          setConnectionStatus('connected');
          socket.send(JSON.stringify({ type: 'subscribe', channels: ['trades:live', 'system:alerts'] }));
          return;
        }

        if (payload.type === 'trade' && payload.channel === 'trades:live' && payload.data) {
          queryClient.setQueryData(['dashboard', { period, chainId }], (current: Awaited<ReturnType<typeof getDashboard>> | undefined) => {
            if (!current) {
              return current;
            }

            const trade = payload.data as {
              id: string;
              executedAt: string;
              route: string;
              netProfitUsd: number;
              gasCostUsd: number;
              status: string;
              txHash: string;
            };

            return {
              ...current,
              dashboard: {
                ...current.dashboard,
                recentTrades: [trade, ...current.dashboard.recentTrades.filter((entry) => entry.id !== trade.id)].slice(0, 5),
              },
            };
          });
        }

        if (payload.type === 'alert' && payload.channel === 'system:alerts' && payload.data) {
          queryClient.setQueryData(['dashboard', { period, chainId }], (current: Awaited<ReturnType<typeof getDashboard>> | undefined) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              dashboard: {
                ...current.dashboard,
                topStrategies: current.dashboard.topStrategies,
              },
              alert: payload.data,
            } as Awaited<ReturnType<typeof getDashboard>> & { alert: Record<string, unknown> };
          });
        }
      });

      socket.addEventListener('close', () => {
        if (!active) {
          return;
        }

        setConnectionStatus('disconnected');
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        socket.close();
      });

      return socket;
    };

    const socket = connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socket?.close();
    };
  }, [accessToken, chainId, period, queryClient, recordMessageReceived, setConnectionStatus]);

  const updatePeriod = (nextPeriod: DashboardPeriod) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('period', nextPeriod);
    setSearchParams(nextParams);
  };

  const updateChain = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'all') {
      nextParams.delete('chainId');
    } else {
      nextParams.set('chainId', value);
    }
    setSearchParams(nextParams);
  };

  if (dashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Card variant="error" title="Dashboard unavailable" subtitle="We could not load your monitoring overview.">
        <button className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100" onClick={() => dashboardQuery.refetch()}>
          <RefreshCcw className="h-4 w-4" />
          Retry
        </button>
      </Card>
    );
  }

  const { dashboard } = dashboardQuery.data;
  const alert = (dashboardQuery.data as (Awaited<ReturnType<typeof getDashboard>> & { alert?: { id: string; severity: string; message: string; createdAt: string } })).alert;
  const showEmptyState = dashboard.recentTrades.length === 0 && dashboard.activeStrategies === 0;

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Monitoring MVP</p>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Profitability, strategy health, and the latest execution signal from the live route surface.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-2xl border border-fx-border bg-fx-surface/90 p-1">
            {PERIODS.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={period === entry}
                className={[
                  'rounded-xl px-3 py-2 text-sm transition',
                  period === entry ? 'bg-cyan-400/15 text-cyan-100' : 'text-fx-text-secondary hover:text-fx-text-primary',
                ].join(' ')}
                onClick={() => updatePeriod(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-fx-border bg-fx-surface/90 px-3 py-2 text-sm text-fx-text-secondary">
            <span>Chain</span>
            <select aria-label="Chain" className="bg-transparent text-fx-text-primary outline-none" value={chainId ? String(chainId) : 'all'} onChange={(event) => updateChain(event.target.value)}>
              <option value="all">All networks</option>
              {dashboard.chains.map((chain) => (
                <option key={chain.chainId} value={chain.chainId}>{chainLabel(chain.chainId)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label="Refresh dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-fx-border bg-fx-surface/90 px-3 py-2 text-sm text-fx-text-secondary transition hover:text-fx-text-primary"
            onClick={() => void dashboardQuery.refetch()}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <LiveIndicator status={connectionStatus === 'connected' ? 'connected' : connectionStatus === 'reconnecting' ? 'reconnecting' : 'polling'} />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Profit" value={formatCurrency(dashboard.totalProfitUsd)} delta={formatCurrency(dashboard.bestOpportunityProfitUsd)} comparisonLabel="best live route" icon={<TrendingUp className="h-5 w-5" />} tone="positive" />
        <StatCard label="Today's Profit" value={formatCurrency(dashboard.todayProfitUsd)} delta={`${dashboard.liveOpportunitiesCount} live`} comparisonLabel="current scan depth" icon={<WalletCards className="h-5 w-5" />} tone="positive" />
        <StatCard label="Success Rate" value={formatPercent(dashboard.successRate)} delta={`${dashboard.totalTrades} trades`} comparisonLabel="period executions" icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Active Strategies" value={String(dashboard.activeStrategies)} delta={`${dashboard.chains.length} chains`} comparisonLabel="monitored now" icon={<Zap className="h-5 w-5" />} />
      </section>

      {connectionStatus !== 'connected' ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Live updates paused; showing last known data while reconnecting. Refreshing every 15 seconds.
        </div>
      ) : null}

      {alert ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {alert.message}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card title="Profit chart" subtitle="Selected period PnL trajectory.">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-fx-text-muted">
              <span>{period} horizon</span>
              <span>{dashboard.profitTrend.length} samples</span>
            </div>
            <div className="grid h-64 grid-cols-3 items-end gap-3 rounded-2xl border border-fx-border-subtle bg-[linear-gradient(180deg,rgba(8,16,26,0.92),rgba(8,16,26,0.55))] p-4">
              {dashboard.profitTrend.map((point) => (
                <div key={point.date} className="flex h-full flex-col justify-end gap-3">
                  <div className="rounded-t-xl bg-[linear-gradient(180deg,rgba(34,211,238,0.95),rgba(45,212,191,0.25))]" style={{ height: `${Math.max(12, point.profit / 40)}px` }} />
                  <div>
                    <p className="font-mono text-sm text-fx-text-primary">{formatCurrency(point.profit)}</p>
                    <p className="text-xs text-fx-text-muted">{point.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Recent momentum" subtitle="Chain mix and current route density.">
          <div className="space-y-3">
            {dashboard.chains.map((chain) => (
              <div key={chain.chainId} className="rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fx-text-secondary">{chainLabel(chain.chainId)}</span>
                  <span className="font-mono text-lg text-fx-text-primary">{chain.liveOpportunitiesCount}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card title="Recent trades" subtitle="Latest five executions for the operator console.">
        {showEmptyState ? (
          <div className="rounded-2xl border border-dashed border-fx-border-subtle bg-fx-surface-strong/50 px-6 py-10 text-center text-sm text-fx-text-secondary">
            No trade history yet. Create a strategy to start capturing profitable routes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-fx-text-secondary">
              <thead className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">
                <tr>
                  <th className="pb-3">Time</th>
                  <th className="pb-3">Route</th>
                  <th className="pb-3">Net Profit</th>
                  <th className="pb-3">Gas</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentTrades.slice(0, 5).map((trade) => (
                  <tr key={trade.id} className="border-t border-fx-border-subtle">
                    <td className="py-4 pr-4">{trade.executedAt.replace('T', ' ').replace('.000Z', '')}</td>
                    <td className="py-4 pr-4 font-medium text-fx-text-primary">{trade.route}</td>
                    <td className="py-4 pr-4 font-mono text-emerald-200">{formatCurrency(trade.netProfitUsd)}</td>
                    <td className="py-4 pr-4">{formatCurrency(trade.gasCostUsd)}</td>
                    <td className="py-4 pr-4">{trade.status}</td>
                    <td className="py-4 pr-4"><a className="text-cyan-100 underline-offset-4 hover:underline" href={`https://etherscan.io/tx/${trade.txHash}`}>View</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
