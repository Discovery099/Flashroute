// apps/web/src/features/analytics/pages/tabs/GasTab.tsx
import { Card, StatCard } from '@flashroute/ui';
import { useAnalyticsGas } from '../../api';
import { HourlyGasChart } from '../../components/charts';
import { formatUsd, formatGwei, NULL_TOOLTIP } from '../../config';

interface GasTabProps {
  period: string;
  chainId?: number;
}

export function GasTab({ period, chainId }: GasTabProps) {
  const { data, isLoading, isError } = useAnalyticsGas({ period, chainId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-24 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
          <div className="h-24 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
          <div className="h-24 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
        </div>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <Card variant="error" title="Failed to load gas analytics" subtitle="Retry to fetch data.">
        <button onClick={() => window.location.reload()} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300">Retry</button>
      </Card>
    );
  }

  const { gas } = data.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Gas Spent"
          value={formatUsd(gas.gasSpentTotalUsd)}
        />
        <StatCard
          label="Avg Gas Cost / Trade"
          value={formatUsd(gas.ourAvgGasCost)}
        />
        <StatCard
          label="Current Base Fee"
          value={formatGwei(gas.currentBaseFeeGwei)}
        />
      </div>
      <Card title="Gas Price Trend" subtitle="Hourly average gas costs from your trades (last 24h).">
        {gas.gasTrend.length > 0 ? (
          <HourlyGasChart data={gas.gasTrend} />
        ) : (
          <p className="py-8 text-center text-sm text-fx-text-secondary">No gas data available yet.</p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Flashbots Savings" subtitle="Gas saved via Flashbots RPC">
          <p className="text-2xl font-mono font-bold text-fx-text-secondary" title={NULL_TOOLTIP.gasSavedByFlashbotsUsd}>—</p>
          <p className="mt-1 text-xs text-fx-text-muted">{NULL_TOOLTIP.gasSavedByFlashbotsUsd}</p>
        </Card>
        <Card title="Optimal Execution Windows" subtitle="Most profitable hours to execute">
          <p className="text-2xl font-mono font-bold text-fx-text-secondary" title={NULL_TOOLTIP.optimalExecutionHours}>—</p>
          <p className="mt-1 text-xs text-fx-text-muted">{NULL_TOOLTIP.optimalExecutionHours}</p>
        </Card>
      </div>
    </div>
  );
}
