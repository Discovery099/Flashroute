import { Button, Card, LiveIndicator } from '@flashroute/ui';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { OpportunityTable } from '../components/OpportunityTable';
import { useLiveOpportunities } from '@/features/live/useLiveOpportunities';
import { useLiveStore } from '@/state/live.store';

const CHAIN_OPTIONS = [
  { value: '42161', label: 'Arbitrum' },
  { value: '1', label: 'Ethereum' },
  { value: '10', label: 'Optimism' },
  { value: '137', label: 'Polygon' },
];

const formatOfflineStamp = (value: string | null) => {
  if (!value) {
    return 'unknown';
  }

  return value.replace('T', ' ').replace('.000Z', '');
};

export function OpportunitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [paused, setPaused] = useState(false);
  const chainId = Number(searchParams.get('chainId') ?? '42161');
  const minProfit = Number(searchParams.get('minProfitUsd') ?? '1');
  const confidenceThreshold = Number(searchParams.get('confidence') ?? '0.5');
  const connectionStatus = useLiveStore((state) => state.connectionStatus);

  const live = useLiveOpportunities({
    chainId,
    minProfitUsd: minProfit,
    paused,
  });

  const filteredOpportunities = useMemo(
    () => live.opportunities.filter((item) => item.confidenceScore >= confidenceThreshold),
    [confidenceThreshold, live.opportunities],
  );

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  };

  const showOffline = connectionStatus !== 'connected';
  const showEmpty = !showOffline && !live.isLoading && filteredOpportunities.length === 0;
  const showError = live.isError && filteredOpportunities.length === 0;

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Discovery surface</p>
          <h1 className="text-3xl font-semibold">Opportunities</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Real-time arbitrage routes with confidence, flash-loan context, gas pressure, and demand prediction.</p>
        </div>
        <LiveIndicator status={connectionStatus === 'connected' ? 'connected' : connectionStatus === 'reconnecting' ? 'reconnecting' : 'disconnected'} />
      </header>

      <Card title="Feed controls" subtitle="Persistent filters keep the analyst view stable across refreshes.">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Chain</span>
            <select aria-label="Chain" className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" value={String(chainId)} onChange={(event) => updateParam('chainId', event.target.value)}>
              {CHAIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Minimum Profit</span>
            <input aria-label="Minimum Profit" type="number" min="0" step="1" value={minProfit} onChange={(event) => updateParam('minProfitUsd', event.target.value)} className="h-11 w-full rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" />
          </label>

          <label className="space-y-2 text-sm text-fx-text-secondary">
            <span>Confidence Threshold</span>
            <input aria-label="Confidence Threshold" type="range" min="0" max="1" step="0.1" value={confidenceThreshold} onChange={(event) => updateParam('confidence', event.target.value)} className="h-11 w-full accent-cyan-400" />
            <div className="text-xs text-fx-text-muted">{Math.round(confidenceThreshold * 100)}% or higher</div>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              role="switch"
              aria-checked={paused}
              aria-label="Pause live updates"
              onClick={() => setPaused((current) => !current)}
              className={[
                'inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition',
                paused ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-fx-border bg-fx-surface text-fx-text-secondary',
              ].join(' ')}
            >
              {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              {paused ? 'Resume live updates' : 'Pause live updates'}
            </button>
          </div>
        </div>
      </Card>

      {showOffline && !showError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <span className="font-medium">Live feed offline.</span> Last update {formatOfflineStamp(live.staleSince)}.
        </div>
      ) : null}

      {paused && live.bufferedCount > 0 ? (
        <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span>Live updates paused. {live.bufferedCount} new opportunities buffered.</span>
          <Button variant="secondary" size="sm" onClick={live.resumeBuffered}>Resume ({live.bufferedCount} new)</Button>
        </div>
      ) : null}

      {live.isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
          ))}
        </div>
      ) : showError ? (
        <Card variant="error" title="Unable to load live opportunities" subtitle="The snapshot request failed before live reconciliation could start.">
          <Button onClick={() => void live.retry()} size="sm">Retry opportunities</Button>
        </Card>
      ) : showEmpty ? (
        <Card title="No live opportunities" subtitle="The analytics engine is scanning continuously.">
          <p className="text-sm text-fx-text-secondary">No profitable opportunities at the moment. The analytics engine is scanning continuously.</p>
        </Card>
      ) : (
        <OpportunityTable opportunities={filteredOpportunities} highlightedIds={live.highlightedIds} />
      )}
    </div>
  );
}
