import { describe, expect, it } from 'vitest';

import type { NormalizedPoolState } from '@flashroute/shared/contracts/pools';

import { GraphBuilder } from './graph-builder';

const makePool = (overrides: Partial<NormalizedPoolState> = {}): NormalizedPoolState => ({
  chainId: 1,
  poolAddress: '0xpool-ab',
  dexType: 'uniswap-v2',
  feeBps: 30,
  blockNumber: 100,
  timestamp: 1_700_000_000,
  tokens: [
    { address: '0xaaa', symbol: 'AAA', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
    { address: '0xbbb', symbol: 'BBB', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
  ],
  normalizedReserves: ['1', '1'],
  spotPrices: {
    '0xaaa->0xbbb': '1.25',
    '0xbbb->0xaaa': '0.75',
  },
  directedPairs: [
    { tokenIn: '0xaaa', tokenOut: '0xbbb', spotPrice: '1.25', feeBps: 30 },
    { tokenIn: '0xbbb', tokenOut: '0xaaa', spotPrice: '0.75', feeBps: 30 },
  ],
  invariant: { kind: 'constant-product' },
  ...overrides,
});

describe('GraphBuilder', () => {
  it('builds directed weighted edges using -ln(exchangeRate)', () => {
    const builder = new GraphBuilder();

    const graph = builder.buildGraph([makePool()]);
    const forwardEdge = graph.edges.find((edge) => edge.poolAddress === '0xpool-ab' && edge.tokenIn === '0xaaa');
    const reverseEdge = graph.edges.find((edge) => edge.poolAddress === '0xpool-ab' && edge.tokenIn === '0xbbb');

    expect(graph.vertices).toEqual(['0xaaa', '0xbbb']);
    expect(graph.edges).toHaveLength(2);
    expect(forwardEdge?.weight).toBeCloseTo(-Math.log(1.25), 12);
    expect(reverseEdge?.weight).toBeCloseTo(-Math.log(0.75), 12);
  });

  it('updates only affected pool edges incrementally and matches a full rebuild', () => {
    const builder = new GraphBuilder();
    const unchangedPool = makePool({
      poolAddress: '0xpool-bc',
      tokens: [
        { address: '0xbbb', symbol: 'BBB', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
        { address: '0xccc', symbol: 'CCC', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
      ],
      spotPrices: {
        '0xbbb->0xccc': '1.1',
        '0xccc->0xbbb': '0.9',
      },
      directedPairs: [
        { tokenIn: '0xbbb', tokenOut: '0xccc', spotPrice: '1.1', feeBps: 30 },
        { tokenIn: '0xccc', tokenOut: '0xbbb', spotPrice: '0.9', feeBps: 30 },
      ],
    });

    const initialGraph = builder.buildGraph([makePool(), unchangedPool]);
    const beforeWeights = new Map(initialGraph.edges.map((edge) => [`${edge.poolAddress}:${edge.tokenIn}->${edge.tokenOut}`, edge.weight]));

    const updatedPool = makePool({
      blockNumber: 101,
      spotPrices: {
        '0xaaa->0xbbb': '1.4',
        '0xbbb->0xaaa': '0.6',
      },
      directedPairs: [
        { tokenIn: '0xaaa', tokenOut: '0xbbb', spotPrice: '1.4', feeBps: 30 },
        { tokenIn: '0xbbb', tokenOut: '0xaaa', spotPrice: '0.6', feeBps: 30 },
      ],
    });

    const updatedGraph = builder.updatePool(updatedPool);
    const afterWeights = new Map(updatedGraph.edges.map((edge) => [`${edge.poolAddress}:${edge.tokenIn}->${edge.tokenOut}`, edge.weight]));
    const rebuiltGraph = new GraphBuilder().buildGraph([updatedPool, unchangedPool]);

    expect(afterWeights.get('0xpool-ab:0xaaa->0xbbb')).not.toBe(beforeWeights.get('0xpool-ab:0xaaa->0xbbb'));
    expect(afterWeights.get('0xpool-ab:0xbbb->0xaaa')).not.toBe(beforeWeights.get('0xpool-ab:0xbbb->0xaaa'));
    expect(afterWeights.get('0xpool-bc:0xbbb->0xccc')).toBe(beforeWeights.get('0xpool-bc:0xbbb->0xccc'));
    expect(afterWeights.get('0xpool-bc:0xccc->0xbbb')).toBe(beforeWeights.get('0xpool-bc:0xccc->0xbbb'));
    expect(updatedGraph.edges).toEqual(rebuiltGraph.edges);
  });

  it('rejects mixed-chain pools instead of building impossible cross-chain routes', () => {
    const builder = new GraphBuilder();

    expect(() =>
      builder.buildGraph([
        makePool({ chainId: 1, poolAddress: '0xpool-mainnet' }),
        makePool({
          chainId: 42161,
          poolAddress: '0xpool-arbitrum',
          tokens: [
            { address: '0xbbb', symbol: 'BBB', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
            { address: '0xccc', symbol: 'CCC', decimals: 18, rawBalance: '1000000000000000000', normalizedBalance: '1' },
          ],
          spotPrices: {
            '0xbbb->0xccc': '1.1',
            '0xccc->0xbbb': '0.9',
          },
          directedPairs: [
            { tokenIn: '0xbbb', tokenOut: '0xccc', spotPrice: '1.1', feeBps: 30 },
            { tokenIn: '0xccc', tokenOut: '0xbbb', spotPrice: '0.9', feeBps: 30 },
          ],
        }),
      ]),
    ).toThrow(/mixed-chain/i);
  });
});
