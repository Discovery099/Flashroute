import { describe, expect, it } from 'vitest';

import type { GraphEdge } from '../graph/graph-builder';
import { GraphBuilder } from '../graph/graph-builder';
import { discoverRoutes } from './route-discovery';

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const makeCycleEdge = (poolAddress: string, tokenIn: string, tokenOut: string, rate: number): GraphEdge => ({
  poolAddress,
  dexType: 'uniswap-v2',
  chainId: 1,
  tokenIn,
  tokenOut,
  feeBps: 30,
  rate,
  weight: -Math.log(rate),
  blockNumber: 100,
  sampleAmountIn: '1',
  sampleAmountOut: String(rate),
});

describe('discoverRoutes', () => {
  it('uses spec defaults for maxHops, minProfitRatio, and maxRoutes', () => {
    const edges: GraphEdge[] = [
      makeCycleEdge('0xpool-ab', '0xaaa', '0xbbb', 1.0002),
      makeCycleEdge('0xpool-ba', '0xbbb', '0xaaa', 1.0002),
      makeCycleEdge('0xpool-cd', '0xccc', '0xddd', 1.01),
      makeCycleEdge('0xpool-dc', '0xddd', '0xccc', 1.01),
      makeCycleEdge('0xpool-ef', '0xeee', '0xfff', 1.02),
      makeCycleEdge('0xpool-fe', '0xfff', '0xeee', 1.02),
      makeCycleEdge('0xpool-gh', '0xggg', '0xhhh', 1.03),
      makeCycleEdge('0xpool-hi', '0xhhh', '0xiii', 1.03),
      makeCycleEdge('0xpool-ig', '0xiii', '0xggg', 1.03),
      makeCycleEdge('0xpool-jk', '0xjjj', '0xkkk', 1.03),
      makeCycleEdge('0xpool-kl', '0xkkk', '0xlll', 1.03),
      makeCycleEdge('0xpool-lm', '0xlll', '0xmmm', 1.03),
      makeCycleEdge('0xpool-mn', '0xmmm', '0xnnn', 1.03),
      makeCycleEdge('0xpool-nj', '0xnnn', '0xjjj', 1.03),
    ];

    for (let index = 0; index < 55; index += 1) {
      edges.push(makeCycleEdge(`0xpool-p-${index}-1`, `0xp${index}`, `0xq${index}`, 1.01));
      edges.push(makeCycleEdge(`0xpool-p-${index}-2`, `0xq${index}`, `0xp${index}`, 1.01));
    }

    const graph = new GraphBuilder().fromEdges(edges);

    const routes = discoverRoutes(graph);

    expect(routes).toHaveLength(50);
    expect(routes.every((route) => route.estimatedProfitRatio > 0.001)).toBe(true);
    expect(routes.every((route) => route.hops <= 4)).toBe(true);
    expect(routes.some((route) => route.signature.includes('0xpool-ab'))).toBe(false);
  });

  it('finds profitable cycles from negative Bellman-Ford cycles', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-ab', '0xaaa', '0xbbb', 1.01),
      makeCycleEdge('0xpool-bc', '0xbbb', '0xccc', 1.01),
      makeCycleEdge('0xpool-ca', '0xccc', '0xaaa', 1.01),
    ]);

    const routes = discoverRoutes(graph, { maxHops: 4 });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.hops).toBe(3);
    expect(routes[0]?.estimatedProfitRatio).toBeGreaterThan(0);
  });

  it('detects a reachable negative cycle even when the prioritized source token is not in the cycle', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xentry', WETH_ADDRESS, '0xaaa', 1),
      makeCycleEdge('0xpool-ab', '0xaaa', '0xbbb', 1.01),
      makeCycleEdge('0xpool-bc', '0xbbb', '0xccc', 1.01),
      makeCycleEdge('0xpool-ca', '0xccc', '0xaaa', 1.01),
    ]);

    const routes = discoverRoutes(graph, {
      maxHops: 4,
      sourceTokens: [WETH_ADDRESS],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.signature).toBe('1|0xaaa>0xpool-ab|0xbbb>0xpool-bc|0xccc>0xpool-ca');
  });

  it('canonicalizes and deduplicates rotated discoveries into one signature', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-ab', '0xaaa', '0xbbb', 1.02),
      makeCycleEdge('0xpool-bc', '0xbbb', '0xccc', 1.01),
      makeCycleEdge('0xpool-ca', '0xccc', '0xaaa', 1.01),
    ]);

    const routes = discoverRoutes(graph, {
      maxHops: 4,
      sourceTokens: ['0xaaa', '0xbbb', '0xccc'],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.signature).toBe('1|0xaaa>0xpool-ab|0xbbb>0xpool-bc|0xccc>0xpool-ca');
  });

  it('excludes profitable cycles that exceed the configured max hops', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-ab', '0xa', '0xb', 1.01),
      makeCycleEdge('0xpool-bc', '0xb', '0xc', 1.01),
      makeCycleEdge('0xpool-cd', '0xc', '0xd', 1.01),
      makeCycleEdge('0xpool-de', '0xd', '0xe', 1.01),
      makeCycleEdge('0xpool-ea', '0xe', '0xa', 1.01),
    ]);

    expect(discoverRoutes(graph, { maxHops: 4 })).toEqual([]);
  });

  it('enforces the hop bound during source-driven search rather than after reconstruction', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-ab', '0xa', '0xb', 1.05),
      makeCycleEdge('0xpool-bc', '0xb', '0xc', 1.05),
      makeCycleEdge('0xpool-cd', '0xc', '0xd', 1.05),
      makeCycleEdge('0xpool-de', '0xd', '0xe', 1.05),
      makeCycleEdge('0xpool-ea', '0xe', '0xa', 1.05),
      makeCycleEdge('0xpool-ac', '0xa', '0xc', 0.8),
      makeCycleEdge('0xpool-ca', '0xc', '0xa', 0.8),
    ]);

    const routes = discoverRoutes(graph, { maxHops: 4, sourceTokens: ['0xa'] });

    expect(routes).toEqual([]);
  });

  it('prioritizes major source-token cycles ahead of obscure tokens using address identifiers', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-wu', WETH_ADDRESS, USDC_ADDRESS, 1.01),
      makeCycleEdge('0xpool-ud', USDC_ADDRESS, DAI_ADDRESS, 1.01),
      makeCycleEdge('0xpool-dw', DAI_ADDRESS, WETH_ADDRESS, 1.005),
      makeCycleEdge('0xpool-xy', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', 1.03),
      makeCycleEdge('0xpool-yz', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', 1.02),
      makeCycleEdge('0xpool-zx', '0x3333333333333333333333333333333333333333', '0x1111111111111111111111111111111111111111', 1.01),
    ]);

    const routes = discoverRoutes(graph, {
      maxHops: 4,
      sourceTokens: [WETH_ADDRESS, '0x1111111111111111111111111111111111111111'],
    });

    expect(routes).toHaveLength(2);
    expect(routes[0]?.sourceToken).toBe(WETH_ADDRESS);
    expect(routes[1]?.sourceToken).toBe('0x1111111111111111111111111111111111111111');
  });

  it('uses default address-based source-token priority when no explicit source token list is provided', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-wu', WETH_ADDRESS, USDC_ADDRESS, 1.01),
      makeCycleEdge('0xpool-ud', USDC_ADDRESS, DAI_ADDRESS, 1.01),
      makeCycleEdge('0xpool-dw', DAI_ADDRESS, WETH_ADDRESS, 1.005),
      makeCycleEdge('0xpool-xy', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', 1.03),
      makeCycleEdge('0xpool-yz', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', 1.02),
      makeCycleEdge('0xpool-zx', '0x3333333333333333333333333333333333333333', '0x1111111111111111111111111111111111111111', 1.01),
    ]);

    const routes = discoverRoutes(graph, { maxHops: 4 });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.sourceToken).toBe(WETH_ADDRESS);
    expect(routes[0]?.signature).toContain('0xpool-wu');
  });

  it('reuses cached routes when the graph is clean and clears the dirty flag after a scan', () => {
    const graph = new GraphBuilder().fromEdges([
      makeCycleEdge('0xpool-ab', WETH_ADDRESS, USDC_ADDRESS, 1.01),
      makeCycleEdge('0xpool-bc', USDC_ADDRESS, DAI_ADDRESS, 1.01),
      makeCycleEdge('0xpool-ca', DAI_ADDRESS, WETH_ADDRESS, 1.01),
    ]);

    const firstRoutes = discoverRoutes(graph, {
      maxHops: 4,
      sourceTokens: [WETH_ADDRESS],
      now: () => 1_700_000_001_000,
    });

    expect(graph.dirty).toBe(false);

    const secondRoutes = discoverRoutes(graph, {
      maxHops: 4,
      sourceTokens: [WETH_ADDRESS],
      now: () => 1_700_000_002_000,
    });

    expect(secondRoutes).toBe(firstRoutes);
    expect(secondRoutes[0]?.discoveredAt).toBe(1_700_000_001_000);
  });

  it('handles a 500-token 2000-edge graph within the performance target', () => {
    const edges: GraphEdge[] = [];

    for (let index = 0; index < 499; index += 1) {
      const next = (index + 1) % 500;
      const jump = (index + 37) % 500;
      edges.push(makeCycleEdge(`0xring-${index}`, `0xt${index}`, `0xt${next}`, 0.999));
      edges.push(makeCycleEdge(`0xjump-${index}`, `0xt${index}`, `0xt${jump}`, 0.9985));
      edges.push(makeCycleEdge(`0xback-${index}`, `0xt${next}`, `0xt${index}`, 1.001));
      edges.push(makeCycleEdge(`0xskip-${index}`, `0xt${jump}`, `0xt${index}`, 1.0005));
    }

    edges.push(makeCycleEdge('0xprofit-ab', WETH_ADDRESS, USDC_ADDRESS, 1.01));
    edges.push(makeCycleEdge('0xprofit-bc', USDC_ADDRESS, DAI_ADDRESS, 1.01));
    edges.push(makeCycleEdge('0xprofit-ca', DAI_ADDRESS, WETH_ADDRESS, 1.01));

    const graph = new GraphBuilder().fromEdges(edges);
    const startedAt = performance.now();
    const routes = discoverRoutes(graph, { maxHops: 4, maxRoutes: 10 });
    const durationMs = performance.now() - startedAt;

    expect(durationMs).toBeLessThan(500);
    expect(routes.some((route) => route.signature.includes('0xprofit-ab'))).toBe(true);
  });
});
