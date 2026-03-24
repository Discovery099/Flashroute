import { Button, Card } from '@flashroute/ui';
import { useSearchParams } from 'react-router-dom';

import { useTrades } from '../api';
import { formatRoutePath, getExplorerUrl, TRADE_STATUS_CONFIG } from '../config';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatDate = (value: string) => new Date(value).toLocaleString('en-US');

const chainLabel: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
};

export function TradesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const chainId = searchParams.get('chainId') ? Number(searchParams.get('chainId')) : undefined;
  const strategyId = searchParams.get('strategyId') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const startDate = searchParams.get('startDate') ?? undefined;
  const endDate = searchParams.get('endDate') ?? undefined;
  const minProfit = searchParams.get('minProfit') ? Number(searchParams.get('minProfit')) : undefined;
  const sortBy = (searchParams.get('sortBy') ?? 'createdAt') as 'createdAt' | 'netProfitUsd' | 'gasUsed';
  const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? '20');

  const tradesQuery = useTrades({ chainId, strategyId, status, startDate, endDate, minProfitUsd: minProfit, sortBy, sortOrder, page, limit });

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

  const clearFilters = () => {
    setSearchParams(new URLSearchParams({ sortBy: 'createdAt', sortOrder: 'desc', page: '1', limit: '20' }));
  };

  const hasActiveFilters = chainId || strategyId || status || startDate || endDate || minProfit;

  if (tradesQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (tradesQuery.isError || !tradesQuery.data) {
    return (
      <Card variant="error" title="Trades unavailable" subtitle="We could not load trade execution data.">
        <p className="text-sm text-fx-text-secondary">Retry the page to fetch the latest trade state.</p>
      </Card>
    );
  }

  const trades = tradesQuery.data?.data?.trades ?? [];
  const meta = tradesQuery.data?.data?.meta ?? { page: 1, limit: 20, total: 0 };

  return (
    <div className="space-y-6 text-fx-text-primary">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Execution</p>
          <h1 className="text-3xl font-semibold">Trades</h1>
          <p className="max-w-3xl text-sm text-fx-text-secondary">Review trade executions, filter by status, chain, or strategy.</p>
        </div>
      </header>

      <Card title="Filters" subtitle="Filter trades by chain, strategy, status, date range, and minimum profit.">
        <div className="grid gap-4 lg:grid-cols-4">
          <select aria-label="Chain" value={searchParams.get('chainId') ?? ''} onChange={(e) => updateParam('chainId', e.target.value)} className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none">
            <option value="">All chains</option>
            <option value="1">Ethereum</option>
            <option value="42161">Arbitrum</option>
            <option value="10">Optimism</option>
            <option value="137">Polygon</option>
          </select>
          <input
            aria-label="Strategy ID"
            value={searchParams.get('strategyId') ?? ''}
            onChange={(e) => updateParam('strategyId', e.target.value)}
            className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none"
            placeholder="Strategy ID"
          />
          <select aria-label="Status" value={searchParams.get('status') ?? ''} onChange={(e) => updateParam('status', e.target.value)} className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none">
            <option value="">All statuses</option>
            <option value="detected">Detected</option>
            <option value="simulated">Simulated</option>
            <option value="submitted_private">Private</option>
            <option value="submitted_public">Public</option>
            <option value="included">Included</option>
            <option value="settled">Settled</option>
            <option value="reverted">Reverted</option>
            <option value="failed">Failed</option>
          </select>
          <input
            aria-label="Min Profit USD"
            type="number"
            value={searchParams.get('minProfit') ?? ''}
            onChange={(e) => updateParam('minProfit', e.target.value)}
            className="h-11 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none"
            placeholder="Min profit (USD)"
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="flex gap-2">
            <input
              aria-label="Start Date"
              type="date"
              value={searchParams.get('startDate') ?? ''}
              onChange={(e) => updateParam('startDate', e.target.value)}
              className="h-11 flex-1 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none"
            />
            <input
              aria-label="End Date"
              type="date"
              value={searchParams.get('endDate') ?? ''}
              onChange={(e) => updateParam('endDate', e.target.value)}
              className="h-11 flex-1 rounded-2xl border border-fx-border bg-fx-surface px-3 text-fx-text-primary outline-none"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="secondary" onClick={clearFilters} className="self-start">Reset filters</Button>
          )}
        </div>
      </Card>

      {trades.length === 0 && hasActiveFilters ? (
        <Card title="No trades match your current filters" subtitle="Try adjusting your filters to see more executions.">
          <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
        </Card>
      ) : trades.length === 0 ? (
        <Card title="No trades yet" subtitle="Trades will appear here once strategies start executing.">{null}</Card>
      ) : (
        <Card title="Trade executions" subtitle="Click a row to view trade details.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-fx-text-muted">
                <tr>
                  <th className="pb-3">Time</th>
                  <th className="pb-3">Chain</th>
                  <th className="pb-3">Strategy</th>
                  <th className="pb-3">Route</th>
                  <th className="pb-3">Flash Loan</th>
                  <th className="pb-3">Profit</th>
                  <th className="pb-3">Gas Cost</th>
                  <th className="pb-3">Net Profit</th>
                  <th className="pb-3">Slippage</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const statusConfig = TRADE_STATUS_CONFIG[trade.status] ?? { label: trade.status, bgClass: 'bg-fx-surface', textClass: 'text-fx-text-secondary', borderClass: 'border-fx-border' };
                  return (
                    <tr
                      key={trade.id}
                      className="cursor-pointer border-t border-fx-border-subtle hover:bg-fx-surface/50"
                      onClick={() => window.location.assign(`/trades/${trade.id}`)}
                    >
                      <td className="py-4 font-mono text-xs">{formatDate(trade.createdAt)}</td>
                      <td className="py-4">{chainLabel[trade.chainId] ?? `Chain ${trade.chainId}`}</td>
                      <td className="py-4 text-fx-text-secondary">{trade.strategyName ?? trade.strategyId}</td>
                      <td className="py-4 font-mono text-xs">{formatRoutePath(trade.routePath)}</td>
                      <td className="py-4 font-mono text-xs">{trade.flashLoanToken}</td>
                      <td className="py-4 font-mono">{formatCurrency(trade.profitUsd)}</td>
                      <td className="py-4 font-mono text-fx-text-secondary">{formatCurrency(trade.gasCostUsd)}</td>
                      <td className="py-4 font-mono font-medium">{formatCurrency(trade.netProfitUsd)}</td>
                      <td className="py-4 text-fx-text-secondary">{trade.slippageBps} bps</td>
                      <td className="py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.bgClass} ${statusConfig.textClass} ${statusConfig.borderClass}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="py-4">
                        <a
                          href={getExplorerUrl(trade.chainId, trade.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          role="link"
                          aria-label="View on Explorer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-200"
                        >
                          <span className="font-mono text-xs">{trade.txHash}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-fx-text-secondary">
            <span>Page {page} of {Math.max(1, Math.ceil(meta.total / limit))}</span>
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
