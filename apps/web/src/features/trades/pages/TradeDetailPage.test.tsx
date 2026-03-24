import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { TradeDetailPage } from './TradeDetailPage';
import { resetAuthStore, useAuthStore } from '@/state/auth.store';
import { renderWithProviders } from '@/test/renderWithProviders';

const settledTradePayload = {
  trade: {
    id: 'trade-1',
    chainId: 42161,
    strategyId: 'strategy-1',
    strategyName: 'Arbitrage Alpha',
    status: 'settled',
    routePath: [
      { tokenIn: 'WETH', tokenOut: 'USDC' },
      { tokenIn: 'USDC', tokenOut: 'DAI' },
      { tokenIn: 'DAI', tokenOut: 'WETH' },
    ],
    routeHops: [
      { tokenIn: 'WETH', tokenOut: 'USDC' },
      { tokenIn: 'USDC', tokenOut: 'DAI' },
      { tokenIn: 'DAI', tokenOut: 'WETH' },
    ],
    flashLoanToken: 'WETH',
    flashLoanAmount: '15.0',
    flashLoanFee: '0.0015',
    profitUsd: 125.5,
    gasCostUsd: 12.3,
    netProfitUsd: 113.2,
    simulatedProfitUsd: 118.0,
    slippagePct: 0.0015,
    gasUsed: 180000,
    executionTimeMs: 450,
    demandPredictionUsed: true,
    competingTxsInBlock: 2,
    txHash: '0xabc123def456',
    blockNumber: 12345678,
    createdAt: '2026-03-22T12:00:00.000Z',
    submittedAt: '2026-03-22T12:00:01.000Z',
    confirmedAt: '2026-03-22T12:00:05.000Z',
  },
  hops: [
    { id: 'h1', tradeId: 'trade-1', hopIndex: 0, tokenIn: 'WETH', tokenOut: 'USDC', pool: '0xpool1', amountIn: '15.0', amountOut: '15000', slippagePct: 0.0005, createdAt: '2026-03-22T12:00:00.000Z' },
    { id: 'h2', tradeId: 'trade-1', hopIndex: 1, tokenIn: 'USDC', tokenOut: 'DAI', pool: '0xpool2', amountIn: '15000', amountOut: '14900', slippagePct: 0.0007, createdAt: '2026-03-22T12:00:00.000Z' },
    { id: 'h3', tradeId: 'trade-1', hopIndex: 2, tokenIn: 'DAI', tokenOut: 'WETH', pool: '0xpool3', amountIn: '14900', amountOut: '14.85', slippagePct: 0.0003, createdAt: '2026-03-22T12:00:00.000Z' },
  ],
};

const revertedTradePayload = {
  trade: {
    id: 'trade-2',
    chainId: 1,
    strategyId: 'strategy-2',
    strategyName: 'ETH Swan',
    status: 'reverted',
    routePath: [
      { tokenIn: 'ETH', tokenOut: 'USDC' },
      { tokenIn: 'USDC', tokenOut: 'ETH' },
    ],
    routeHops: [
      { tokenIn: 'ETH', tokenOut: 'USDC' },
      { tokenIn: 'USDC', tokenOut: 'ETH' },
    ],
    flashLoanToken: 'ETH',
    flashLoanAmount: '10.0',
    flashLoanFee: '0.001',
    profitUsd: 0,
    gasCostUsd: 25.0,
    netProfitUsd: -26.0,
    simulatedProfitUsd: 50.0,
    slippagePct: 0.0025,
    gasUsed: 200000,
    executionTimeMs: 1200,
    demandPredictionUsed: false,
    competingTxsInBlock: 5,
    txHash: '0xreverted789',
    blockNumber: 9876543,
    createdAt: '2026-03-22T14:00:00.000Z',
    submittedAt: '2026-03-22T14:00:02.000Z',
    errorMessage: 'Insufficient liquidity in final pool',
  },
  hops: [
    { id: 'h4', tradeId: 'trade-2', hopIndex: 0, tokenIn: 'ETH', tokenOut: 'USDC', pool: '0xpoolA', amountIn: '10.0', amountOut: '10000', slippagePct: 0.001, createdAt: '2026-03-22T14:00:00.000Z' },
    { id: 'h5', tradeId: 'trade-2', hopIndex: 1, tokenIn: 'USDC', tokenOut: 'ETH', pool: '0xpoolB', amountIn: '9900', amountOut: '9.8', slippagePct: 0.0015, createdAt: '2026-03-22T14:00:00.000Z' },
  ],
};

describe('TradeDetailPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().completeLogin({ accessToken: 'trade-detail-token' });
  });

  it('renders all five sections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: settledTradePayload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades/:id" element={<TradeDetailPage />} />
      </Routes>,
      { route: '/trades/trade-1' },
    );

    expect(await screen.findByText(/arbitrage alpha/i)).toBeInTheDocument();
    expect(await screen.findByText(/^summary$/i)).toBeInTheDocument();
    expect(await screen.findByText(/^route$/i)).toBeInTheDocument();
    expect(await screen.findByText(/financial summary/i)).toBeInTheDocument();
    expect(await screen.findByText(/execution diagnostics/i)).toBeInTheDocument();
    expect(await screen.findByText(/raw metadata/i)).toBeInTheDocument();
  });

  it('shows simulated vs actual delta in financial summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: settledTradePayload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades/:id" element={<TradeDetailPage />} />
      </Routes>,
      { route: '/trades/trade-1' },
    );

    expect(await screen.findByText(/simulation accuracy/i)).toBeInTheDocument();
    expect(screen.getByText(/\$4\.80/i)).toBeInTheDocument();
  });

  it('shows correct status banner for settled and reverted trades', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: revertedTradePayload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/trades/:id" element={<TradeDetailPage />} />
      </Routes>,
      { route: '/trades/trade-2' },
    );

    expect(await screen.findByText(/insufficient liquidity in final pool/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reverted/i).length).toBeGreaterThan(0);
  });
});
