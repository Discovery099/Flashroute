// apps/web/src/features/analytics/pages/tabs/CompetitorsTab.tsx
import { Card } from '@flashroute/ui';
import { useAnalyticsCompetitors } from '../../api';
import { formatUsd } from '../../config';

interface CompetitorsTabProps {
  chainId?: number;
}

export function CompetitorsTab({ chainId }: CompetitorsTabProps) {
  const { data, isLoading, isError } = useAnalyticsCompetitors({ chainId, limit: 20 });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (isError || !data?.data) {
    return (
      <Card variant="error" title="Failed to load competitor data" subtitle="Retry to fetch data.">
        <button onClick={() => window.location.reload()} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300">Retry</button>
      </Card>
    );
  }

  const { competitors, totalCompetitorTrades, ourWinRate } = data.data;

  if (competitors.length === 0) {
    return (
      <Card title="No competitor activity" subtitle="Competitor bot activity will appear once the network scanner is running.">{null}</Card>
    );
  }

  return (
    <Card title="Competitor Activity" subtitle={`${totalCompetitorTrades} total competitor transactions detected.`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-fx-text-muted">
              <th className="pb-3 text-left">Bot Address</th>
              <th className="pb-3 text-right">Trades</th>
              <th className="pb-3 text-right">Est. Profit</th>
              <th className="pb-3 text-right">Avg Gas</th>
              <th className="pb-3 text-left">Top Routes</th>
              <th className="pb-3 text-left">First Seen</th>
              <th className="pb-3 text-left">Last Seen</th>
              <th className="pb-3 text-right">Our Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp) => (
              <tr key={comp.botAddress} className="border-t border-fx-border-subtle hover:bg-fx-surface/50">
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">{comp.botAddress.substring(0, 10)}...</span>
                    <a
                      href={`https://etherscan.io/address/${comp.botAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-200"
                      aria-label="View on Etherscan"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                </td>
                <td className="py-3 text-right font-mono">{comp.tradeCount}</td>
                <td className="py-3 text-right font-mono">{formatUsd(comp.estimatedProfitUsd)}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary">{comp.avgGasPriceGwei.toFixed(2)} gwei</td>
                <td className="py-3 text-xs text-fx-text-secondary">{comp.mostUsedRoutes.slice(0, 2).join(', ')}</td>
                <td className="py-3 font-mono text-xs text-fx-text-secondary">{new Date(comp.firstSeenAt).toLocaleDateString()}</td>
                <td className="py-3 font-mono text-xs text-fx-text-secondary">{new Date(comp.lastSeenAt).toLocaleDateString()}</td>
                <td className="py-3 text-right font-mono text-fx-text-secondary" title="Available after Phase G aggregation">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
