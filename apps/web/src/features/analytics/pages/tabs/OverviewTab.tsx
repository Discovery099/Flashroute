// apps/web/src/features/analytics/pages/tabs/OverviewTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsOverview } from '../../api';
import { ProfitChart, VolumeChart, SuccessRateChart } from '../../components/charts';

interface OverviewTabProps {
  period: string;
  chainId?: number;
}

export function OverviewTab({ period, chainId }: OverviewTabProps) {
  const { data, isLoading, isError } = useAnalyticsOverview({ period, chainId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
          <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
        </div>
        <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <Card variant="error" title="Failed to load analytics" subtitle="Retry to fetch data.">
        <button onClick={() => window.location.reload()} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300">
          Retry
        </button>
      </Card>
    );
  }

  const { profitTrend, volumeTrend, successRateTrend, dailyBreakdown } = data.data;

  if (dailyBreakdown.length === 0) {
    return (
      <Card title="No trade data for this period" subtitle="Analytics will appear once you have executed trades in the selected period.">{null}</Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profit Trend" subtitle="Cumulative net profit over time">
          <ProfitChart data={profitTrend} />
        </Card>
        <Card title="Volume" subtitle="Trade count and volume per day">
          <VolumeChart data={volumeTrend} />
        </Card>
      </div>
      <Card title="Success Rate" subtitle="Percentage of successful trades over time">
        <SuccessRateChart data={successRateTrend} />
      </Card>
      <Card title="Daily Breakdown" subtitle="Per-day profit and gas breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-fx-text-muted">
                <th className="pb-3 text-left">Date</th>
                <th className="pb-3 text-right">Gross Profit</th>
                <th className="pb-3 text-right">Gas Cost</th>
                <th className="pb-3 text-right">Net Profit</th>
                <th className="pb-3 text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {dailyBreakdown.map((row) => (
                <tr key={row.date} className="border-t border-fx-border-subtle">
                  <td className="py-3 font-mono text-xs">{row.date}</td>
                  <td className="py-3 text-right font-mono">${row.grossProfitUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono text-fx-text-secondary">${row.gasCostUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono font-medium">${row.netProfitUsd.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono">{row.tradeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
