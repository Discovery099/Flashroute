import { Button, Card } from '@flashroute/ui';
import { useNavigate, useParams } from 'react-router-dom';

import { useTrade } from '../api';
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

export function TradeDetailPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const tradeQuery = useTrade(id);

  if (tradeQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-3xl border border-fx-border bg-fx-surface/80" />;
  }

  if (tradeQuery.isError || !tradeQuery.data?.data?.trade) {
    return (
      <Card variant="error" title="Trade not found" subtitle="The requested trade could not be loaded.">
        <Button variant="secondary" onClick={() => navigate('/trades')} data-testid="back-button">Back to trades</Button>
      </Card>
    );
  }

  const trade = tradeQuery.data.data.trade;
  const hops = tradeQuery.data.data.hops;
  const statusConfig = TRADE_STATUS_CONFIG[trade.status] ?? { label: trade.status, bgClass: 'bg-fx-surface', textClass: 'text-fx-text-secondary', borderClass: 'border-fx-border' };
  const simulatedDelta = (trade.simulatedProfitUsd ?? 0) - trade.netProfitUsd;

  return (
    <div className="space-y-6 text-fx-text-primary">
      {trade.status === 'settled' && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">
          Trade confirmed — net profit {formatCurrency(trade.netProfitUsd)}
        </div>
      )}
      {trade.status === 'reverted' && trade.errorMessage && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
          {trade.errorMessage}
        </div>
      )}
      {trade.status === 'failed' && trade.errorMessage && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
          {trade.errorMessage}
        </div>
      )}

      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">Trade detail</p>
          <h1 className="text-3xl font-semibold">{trade.strategyName ?? trade.strategyId}</h1>
          <p className="text-sm text-fx-text-secondary">
            {chainLabel[trade.chainId] ?? `Chain ${trade.chainId}`}
            <span className="ml-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.bgClass} ${statusConfig.textClass} ${statusConfig.borderClass}`}>
                {statusConfig.label}
              </span>
            </span>
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/trades')}>Back to trades</Button>
      </header>

      <Card title="Summary" subtitle="Trade metadata and key timestamps.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Created</p>
            <p className="mt-1 font-mono">{formatDate(trade.createdAt)}</p>
          </div>
          {trade.submittedAt && (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Submitted</p>
              <p className="mt-1 font-mono">{formatDate(trade.submittedAt)}</p>
            </div>
          )}
          {trade.confirmedAt && (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Confirmed</p>
              <p className="mt-1 font-mono">{formatDate(trade.confirmedAt)}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Tx Hash</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-xs">{trade.txHash}</p>
              <button
                onClick={() => navigator.clipboard.writeText(trade.txHash)}
                className="text-fx-text-muted hover:text-fx-text-primary"
                aria-label="Copy tx hash"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <a
                href={getExplorerUrl(trade.chainId, trade.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-200"
                aria-label="View on Explorer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Block</p>
            <p className="mt-1 font-mono">{trade.blockNumber}</p>
          </div>
        </div>
      </Card>

      <Card title="Route" subtitle="Execution path through liquidity pools.">
        <div className="space-y-3">
          {trade.routePath.map((hop, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <span className="font-mono">{hop.tokenIn} → {hop.tokenOut}</span>
              {hops[idx] && (
                <span className="text-fx-text-muted">
                  {hops[idx].pool ?? hops[idx].dex}
                </span>
              )}
            </div>
          ))}
          {hops && hops.length > 0 && (
            <div className="mt-4 space-y-2 rounded-2xl border border-fx-border bg-fx-surface/50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Hop details</p>
              {hops.map((hop, idx) => (
                <div key={idx} className="grid gap-2 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-fx-text-muted">Amount in</p>
                    <p className="font-mono">{hop.amountIn} {hop.tokenIn}</p>
                  </div>
                  <div>
                    <p className="text-fx-text-muted">Amount out</p>
                    <p className="font-mono">{hop.amountOut} {hop.tokenOut}</p>
                  </div>
                  <div>
                    <p className="text-fx-text-muted">Slippage</p>
                    <p className="font-mono">{hop.slippagePct} %</p>
                  </div>
                  <div>
                    <p className="text-fx-text-muted">Pool / DEX</p>
                    <p className="font-mono text-xs">{hop.pool ?? hop.dex}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Financial summary" subtitle="Profitability breakdown for this trade.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Flash loan</p>
            <p className="mt-1 font-mono">{trade.flashLoanAmount} {trade.flashLoanToken}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Flash loan fee</p>
            <p className="mt-1 font-mono">{trade.flashLoanFee ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Gross profit</p>
            <p className="mt-1 font-mono">{formatCurrency(trade.profitUsd)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Gas cost</p>
            <p className="mt-1 font-mono text-fx-text-secondary">{formatCurrency(trade.gasCostUsd)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Net profit</p>
            <p className="mt-1 font-mono font-bold">{formatCurrency(trade.netProfitUsd)}</p>
          </div>
          {trade.simulatedProfitUsd !== null && (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Simulation accuracy</p>
              <p className={`mt-1 font-mono ${simulatedDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {simulatedDelta > 0 ? '↑' : '↓'} {formatCurrency(Math.abs(simulatedDelta))}
                {simulatedDelta > 0 ? ' (actual better)' : ' (simulated better)'}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Execution diagnostics" subtitle="Performance metrics and revert details if applicable.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Execution time</p>
            <p className="mt-1 font-mono">{trade.executionTimeMs} ms</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Demand prediction</p>
            <p className="mt-1">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${trade.demandPredictionUsed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-fx-border bg-fx-surface text-fx-text-secondary'}`}>
                {trade.demandPredictionUsed ? 'Yes' : 'No'}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Competing txs</p>
            <p className="mt-1 font-mono">{trade.competingTxsInBlock ?? 0}</p>
          </div>
          {(trade.status === 'failed') && trade.errorMessage && (
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-[0.24em] text-red-400">Failure reason</p>
              <p className="mt-1 font-mono text-red-300">{trade.errorMessage}</p>
            </div>
          )}
        </div>
      </Card>

      <details className="rounded-2xl border border-fx-border bg-fx-surface/50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-fx-text-muted hover:text-fx-text-primary">
          Raw metadata
        </summary>
        <div className="space-y-3 px-4 pb-4 pt-2 text-xs">
          <div>
            <p className="text-fx-text-muted">txHash</p>
            <p className="font-mono">{trade.txHash}</p>
          </div>
          <div>
            <p className="text-fx-text-muted">blockNumber</p>
            <p className="font-mono">{trade.blockNumber}</p>
          </div>
          <div>
            <p className="text-fx-text-muted">routePath</p>
            <pre className="mt-1 overflow-x-auto rounded-xl border border-fx-border bg-fx-bg p-3 font-mono text-fx-text-secondary">
              {JSON.stringify(trade.routePath, null, 2)}
            </pre>
          </div>
          {trade.simulatedProfitUsd !== null && (
            <div>
              <p className="text-fx-text-muted">simulatedProfitUsd</p>
              <p className="font-mono">{trade.simulatedProfitUsd}</p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
