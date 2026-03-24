import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@flashroute/ui';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { activateStrategy, deactivateStrategy, deleteStrategy, getStrategies, type StrategyRecord } from '../api';
import { chainLabel } from '../config';
import { useUiStore } from '@/state/ui.store';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatLastRun = (value: string | null) => (value ? new Date(value).toLocaleString('en-US') : 'Never');

export function StrategyListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const [optimisticStates, setOptimisticStates] = useState<Record<string, boolean | undefined>>({});
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? '20');
  const chainId = searchParams.get('chainId');
  const status = (searchParams.get('status') ?? 'all') as 'all' | 'active' | 'paused' | 'draft';
  const search = searchParams.get('search') ?? '';

  const strategiesQuery = useQuery({
    queryKey: ['strategies', { page, limit, chainId, status, search }],
    queryFn: () => getStrategies({ page, limit, chainId: chainId ? Number(chainId) : undefined, status, search }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (strategy: StrategyRecord) => (strategy.isActive ? deactivateStrategy(strategy.id) : activateStrategy(strategy.id)),
    onMutate: (strategy) => {
      setOptimisticStates((current) => ({ ...current, [strategy.id]: !strategy.isActive }));
      return { previousValue: strategy.isActive, strategyId: strategy.id };
    },
    onError: (error, _strategy, context) => {
      if (context?.strategyId) {
        setOptimisticStates((current) => ({ ...current, [context.strategyId]: context.previousValue }));
      }
      pushToast({
        id: `strategy-toggle-${Date.now()}`,
        title: 'Status change failed',
        description: error instanceof Error ? error.message : 'Activation failed',
        tone: 'warning',
      });
    },
    onSuccess: (result) => {
      setOptimisticStates((current) => ({ ...current, [result.strategy.id]: result.strategy.isActive }));
      void queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (strategyId: string) => deleteStrategy(strategyId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['strategies'] }),
  });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (key !== 'page') {
      next.set('page', '1');
    }
    if (value.length === 0) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
  };

  if (strategiesQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (strategiesQuery.isError || !strategiesQuery.data) {
    return <Card variant="error" title="Strategies unavailable" subtitle="We could not load strategy management data."><p className="text-sm text-fx-text-secondary">Retry the page to fetch the latest strategy state.</p></Card>;
  }

  const strategies = strategiesQuery.data.strategies;

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Automation</p>
          <h1 className="text-3xl font-semibold">Strategies</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Manage execution rules, activation state, and routing constraints from one surface.</p>
        </div>
        <Button as={Link} to="/strategies/new">New Strategy</Button>
      </header>

      <Card title="Filters" subtitle="Search and refine strategies without losing your current view.">
        <div className="grid gap-4 lg:grid-cols-3">
          <input aria-label="Search" value={search} onChange={(event) => updateParam('search', event.target.value)} className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none" placeholder="Search strategies" />
          <select aria-label="Chain Filter" value={chainId ?? ''} onChange={(event) => updateParam('chainId', event.target.value)} className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none">
            <option value="">All chains</option>
            <option value="1">Ethereum</option>
            <option value="42161">Arbitrum</option>
            <option value="10">Optimism</option>
            <option value="137">Polygon</option>
          </select>
          <select aria-label="Status Filter" value={status} onChange={(event) => updateParam('status', event.target.value)} className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </Card>

      {strategies.length === 0 ? (
        <Card title="No strategies configured" subtitle="Create your first strategy to start finding arbitrage opportunities.">
          <Button as={Link} to="/strategies/new">Create Strategy</Button>
        </Card>
      ) : (
        <Card title="Strategy table" subtitle="Activation toggles update optimistically and roll back automatically on failure.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-fx-text-muted">
                <tr>
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Chain</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Min Profit</th>
                  <th className="pb-3">Max Hops</th>
                  <th className="pb-3">Trades</th>
                  <th className="pb-3">Profit</th>
                  <th className="pb-3">Flash Provider</th>
                  <th className="pb-3">Last Run</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((strategy) => (
                  (() => {
                    const isActive = optimisticStates[strategy.id] ?? strategy.isActive;
                    return (
                  <tr key={strategy.id} className="border-t border-fx-border-subtle">
                    <td className="py-4"><Link to={`/strategies/${strategy.id}`} className="font-medium text-fx-text-primary hover:text-cyan-200">{strategy.name}</Link></td>
                    <td className="py-4 text-fx-text-secondary">{chainLabel(strategy.chainId)}</td>
                    <td className="py-4">
                      <button
                        type="button"
                        role="switch"
                        aria-label={`Toggle strategy ${strategy.name}`}
                        aria-checked={isActive ? 'true' : 'false'}
                        onClick={() => toggleMutation.mutate(strategy)}
                        className={['inline-flex rounded-full border px-3 py-1 text-xs font-medium', isActive ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100' : 'border-fx-border bg-fx-surface text-fx-text-secondary'].join(' ')}
                      >
                        {isActive ? 'Active' : 'Draft'}
                      </button>
                    </td>
                    <td className="py-4 font-mono">{formatCurrency(strategy.minProfitUsd)}</td>
                    <td className="py-4">{strategy.maxHops}</td>
                    <td className="py-4">{strategy.executionCount}</td>
                    <td className="py-4 font-mono">{formatCurrency(strategy.totalProfitUsd)}</td>
                    <td className="py-4">{strategy.flashLoanProvider}</td>
                    <td className="py-4">{formatLastRun(strategy.lastRunAt)}</td>
                    <td className="py-4">
                      <div className="flex gap-2">
                        <Button as={Link} to={`/strategies/${strategy.id}/edit`} variant="ghost" size="sm">Edit</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!window.confirm(`Delete strategy "${strategy.name}"? Historical trades remain, but this strategy configuration will be removed.`)) {
                              return;
                            }
                            await deleteMutation.mutateAsync(strategy.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-fx-text-secondary">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => updateParam('page', String(Math.max(1, page - 1)))}>Previous</Button>
              <Button variant="ghost" size="sm" onClick={() => updateParam('page', String(page + 1))}>Next</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
