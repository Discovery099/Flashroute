import { Card } from '@flashroute/ui';

import type { OpportunityItem } from '../types';
import { getOpportunityRouteLabel } from '../types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatCountdown = (expiresAt: number) => {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  return `${seconds}s`;
};

export function OpportunityTable({
  opportunities,
  highlightedIds,
}: {
  opportunities: OpportunityItem[];
  highlightedIds: Record<string, boolean>;
}) {
  return (
    <Card title="Live opportunities" subtitle="Current profitable routes ranked for operator review.">
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full text-left text-sm text-fx-text-secondary">
          <thead className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">
            <tr>
              <th className="pb-3">Route</th>
              <th className="pb-3">Estimated Profit</th>
              <th className="pb-3">Confidence</th>
              <th className="pb-3">Flash Loan</th>
              <th className="pb-3">Gas</th>
              <th className="pb-3">Expires</th>
              <th className="pb-3">Demand</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opportunity) => (
              <tr
                key={opportunity.id}
                data-testid="opportunity-row"
                data-highlighted={highlightedIds[opportunity.id] ? 'true' : 'false'}
                data-expiring={opportunity.isExpiring ? 'true' : 'false'}
                className={[
                  'border-t border-fx-border-subtle transition duration-500',
                  highlightedIds[opportunity.id] ? 'bg-cyan-400/10 text-fx-text-primary' : '',
                  opportunity.isExpiring ? 'opacity-35 saturate-50' : '',
                ].join(' ')}
              >
                <td className="py-4 pr-4 font-medium text-fx-text-primary">{getOpportunityRouteLabel(opportunity)}</td>
                <td className="py-4 pr-4 font-mono text-emerald-200">{formatCurrency(opportunity.estimatedProfitUsd)}</td>
                <td className="py-4 pr-4">{Math.round(opportunity.confidenceScore * 100)}%</td>
                <td className="py-4 pr-4">{opportunity.flashLoanAmount} {opportunity.flashLoanToken}</td>
                <td className="py-4 pr-4">{opportunity.gasEstimateGwei?.toFixed(2) ?? '--'} gwei</td>
                <td className="py-4 pr-4">{formatCountdown(opportunity.expiresAt)}</td>
                <td className="py-4">
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-cyan-100">
                    {opportunity.demandPrediction.badge ?? 'watch'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 lg:hidden">
        {opportunities.map((opportunity) => (
          <article
            key={opportunity.id}
            data-testid="opportunity-row"
            data-highlighted={highlightedIds[opportunity.id] ? 'true' : 'false'}
            data-expiring={opportunity.isExpiring ? 'true' : 'false'}
            className={[
              'rounded-2xl border border-fx-border-subtle bg-fx-surface-strong/60 p-4 transition duration-500',
              highlightedIds[opportunity.id] ? 'border-cyan-400/40 bg-cyan-400/10' : '',
              opportunity.isExpiring ? 'opacity-35 saturate-50' : '',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-fx-text-primary">{getOpportunityRouteLabel(opportunity)}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-fx-text-muted">{Math.round(opportunity.confidenceScore * 100)}% confidence</p>
              </div>
              <p className="font-mono text-lg text-emerald-200">{formatCurrency(opportunity.estimatedProfitUsd)}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-fx-text-secondary">
              <div>Flash loan: {opportunity.flashLoanAmount} {opportunity.flashLoanToken}</div>
              <div>Gas: {opportunity.gasEstimateGwei?.toFixed(2) ?? '--'} gwei</div>
              <div>Expires: {formatCountdown(opportunity.expiresAt)}</div>
              <div>Demand: {opportunity.demandPrediction.badge ?? 'watch'}</div>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
