import { useSearchParams } from 'react-router-dom';
import { Card } from '@flashroute/ui';
import { PERIOD_OPTIONS, CHAIN_OPTIONS } from '../config';
import { OverviewTab } from './tabs/OverviewTab';
import { RoutesTab } from './tabs/RoutesTab';
import { CompetitorsTab } from './tabs/CompetitorsTab';
import { GasTab } from './tabs/GasTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'routes', label: 'Routes' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'gas', label: 'Gas' },
] as const;

type Tab = typeof TABS[number]['value'];

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get('tab') ?? 'overview') as Tab;
  const period = searchParams.get('period') ?? '7d';
  const chainId = searchParams.get('chainId') ? Number(searchParams.get('chainId')) : undefined;

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next);
  };

  const setPeriod = (p: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('period', p);
    next.set('page', '1');
    setSearchParams(next);
  };

  const setChainId = (c: string) => {
    const next = new URLSearchParams(searchParams);
    if (c) next.set('chainId', c);
    else next.delete('chainId');
    next.set('page', '1');
    setSearchParams(next);
  };

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Analytics</p>
          <h1 className="text-3xl font-semibold">Analytics</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Platform-wide performance metrics and route analytics.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm text-fx-text-primary outline-none"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={searchParams.get('chainId') ?? ''}
            onChange={(e) => setChainId(e.target.value)}
            className="h-10 rounded-2xl border border-fx-border bg-fx-surface px-3 text-sm text-fx-text-primary outline-none"
          >
            {CHAIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex gap-1 border-b border-fx-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-cyan-400 text-cyan-400'
                : 'text-fx-text-muted hover:text-fx-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {tab === 'overview' && <OverviewTab period={period} chainId={chainId} />}
        {tab === 'routes' && <RoutesTab period={period} chainId={chainId} />}
        {tab === 'competitors' && <CompetitorsTab chainId={chainId} />}
        {tab === 'gas' && <GasTab period={period} chainId={chainId} />}
      </div>
    </div>
  );
}
