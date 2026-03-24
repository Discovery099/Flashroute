import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, StatCard } from '@flashroute/ui';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { activateStrategy, deactivateStrategy, deleteStrategy, getStrategy } from '../api';
import { chainLabel } from '../config';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function StrategyDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const strategyQuery = useQuery({ queryKey: ['strategy', id], queryFn: () => getStrategy(id), enabled: id.length > 0 });
  const toggleMutation = useMutation({
    mutationFn: () => strategyQuery.data?.strategy.isActive ? deactivateStrategy(id) : activateStrategy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategy', id] }),
  });
  const deleteMutation = useMutation({ mutationFn: () => deleteStrategy(id) });

  if (strategyQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (strategyQuery.isError || !strategyQuery.data) {
    return (
      <Card variant="error" title="Strategy not found" subtitle="The requested strategy could not be loaded.">
        <Button as={Link} to="/strategies" variant="secondary">Back to strategies</Button>
      </Card>
    );
  }

  const { strategy, performance } = strategyQuery.data;

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Strategy detail</p>
          <h1 className="text-3xl font-semibold">{strategy.name}</h1>
          <p className="text-sm text-fx-text-secondary">{chainLabel(strategy.chainId)} · {strategy.isActive ? 'Active' : 'Draft'}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant={strategy.isActive ? 'secondary' : 'success'} onClick={() => toggleMutation.mutate()}>{strategy.isActive ? 'Deactivate' : 'Activate'}</Button>
          <Button as={Link} to={`/strategies/${strategy.id}/edit`} variant="secondary">Edit</Button>
          <Button as={Link} to="/strategies/new" variant="secondary">Duplicate</Button>
          <Button variant="danger" onClick={async () => { if (window.confirm(`Delete strategy "${strategy.name}"? Historical trades remain, but this strategy configuration will be removed.`)) { await deleteMutation.mutateAsync(); await navigate('/strategies'); } }}>Delete</Button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Trades" value={String(performance.executionCount)} />
        <StatCard label="Success rate" value={`${(performance.successRate * 100).toFixed(1)}%`} />
        <StatCard label="Total profit" value={formatCurrency(performance.totalProfitUsd)} />
        <StatCard label="Average profit" value={formatCurrency(performance.averageProfitUsd)} />
        <StatCard label="Best trade" value={formatCurrency(performance.bestTradeUsd)} />
      </section>

      <Card title="Performance trend" subtitle="Chart foundation for strategy-specific performance over time in this phase.">
        <div className="h-48 rounded-2xl border border-dashed border-fx-border bg-fx-surface/60 p-4 text-sm text-fx-text-secondary">
          Performance chart data hooks into this strategy detail foundation next. The section is reserved and scoped to the selected strategy now.
        </div>
      </Card>

      <Card title="Configuration summary" subtitle="Core execution constraints for this strategy.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-sm text-fx-text-secondary">
          <div>Description: {strategy.description || 'No internal notes yet.'}</div>
          <div>Chain: {chainLabel(strategy.chainId)}</div>
          <div>Min Profit: {formatCurrency(strategy.minProfitUsd)}</div>
          <div>Max Hops: {strategy.maxHops}</div>
          <div>Cooldown: {strategy.cooldownSeconds}s</div>
          <div>Risk Buffer: {strategy.riskBufferPct}%</div>
          <div>Max Slippage: {strategy.maxSlippageBps} bps</div>
          <div>Flashbots: {strategy.useFlashbots ? 'Enabled' : 'Disabled'}</div>
          <div>Demand Prediction: {strategy.useDemandPrediction ? 'Enabled' : 'Disabled'}</div>
          <div>DEXes: {strategy.allowedDexes.join(', ')}</div>
        </div>
      </Card>

      <Card title="Trade history" subtitle="Strategy-filtered trade history foundation for this phase.">
        <p className="text-sm text-fx-text-secondary">Trade history is filtered to this strategy. Full trade execution rows remain shell-level for this phase, but the detail surface is now ready for strategy-specific history data.</p>
      </Card>
    </div>
  );
}
