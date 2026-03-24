// apps/web/src/features/analytics/pages/tabs/RoutesTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsRoutes } from '../../api';

interface RoutesTabProps {
  period: string;
  chainId?: number;
}

const formatRoutePath = (routeKey: string): string => {
  const parts = routeKey.split('→');
  return parts.map((p) => p.trim()).join(' → ');
};

export function RoutesTab({ period, chainId }: RoutesTabProps) {
  const { data, isLoading, isError } = useAnalyticsRoutes({ period, chainId, limit: 20 });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (isError || !data?.data) {
    return (
      <Card variant="error" title="Failed to load route analytics" subtitle="Retry to fetch data.">
        <button onClick={() => window.location.reload()} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300">Retry</button>
      </Card>
    );
  }

  const { routes } = data.data;

  if (routes.length === 0) {
    return (
      <Card title="No route data" subtitle="Route analytics will appear once you have executed trades.">{null}</Card>
    );
  }

  return (
    <Card title="Route Performance" subtitle="Most profitable routes by total net profit.">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-fx-text-muted">
              <th className="pb-3 text-left">Route</th>
              <th className="pb-3 text-right">Executions</th>
              <th className="pb-3 text-right">Success Rate</th>
              <th className="pb-3 text-right">Total Profit</th>
              <th className="pb-3 text-right">Avg Profit</th>
              <th className="pb-3 text-right">Avg Slippage</th>
              <th className="pb-3 text-right">Avg Time</th>
              <th className="pb-3 text-right">Last Executed</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.routeKey} className="border-t border-fx-border-subtle hover:bg-fx-surface/50">
                <td className="py-3 font-mono text-xs">{formatRoutePath(route.routeKey)}</td>
                <td className="py-3 text-right font-mono">{route.executionCount}</td>
                <td className="py-3 text-right font-mono">{((route.successCount / route.executionCount) * 100).toFixed(1)}%</td>
                <td className="py-3 text-right font-mono font-medium">${route.totalProfitUsd.toFixed(2)}</td>
                <td className="py-3 text-right font-mono">${route.avgProfitUsd.toFixed(2)}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{(route.avgSlippagePct * 100).toFixed(2)}%</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{route.avgExecutionTimeMs}ms</td>
                <td className="py-3 text-right font-mono text-xs text-fx-text-secondary">
                  {new Date(route.lastExecutedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
