import type { OpportunityRoute } from '@flashroute/shared/contracts/opportunity';
import type { DexType, NormalizedPoolState } from '@flashroute/shared/contracts/pools';

export interface GraphEdge {
  poolAddress: string;
  dexType: DexType;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  feeBps: number;
  rate: number;
  weight: number;
  blockNumber: number;
  sampleAmountIn: string;
  sampleAmountOut: string;
}

export interface Graph {
  chainId: number | null;
  vertices: string[];
  edges: GraphEdge[];
  edgeEndpoints: Array<{ from: number; to: number }>;
  edgeIndexByKey: Map<string, number>;
  adjacency: number[][];
  vertexIndex: Map<string, number>;
  dirty: boolean;
  cachedRoutes: {
    optionsKey: string;
    routes: OpportunityRoute[];
  } | null;
}

export class GraphBuilder {
  private graph: Graph = this.createEmptyGraph();
  private readonly pools = new Map<string, NormalizedPoolState>();

  buildGraph(pools: NormalizedPoolState[]): Graph {
    this.assertSingleChain(pools.map((pool) => pool.chainId));
    this.pools.clear();
    for (const pool of pools) {
      this.pools.set(pool.poolAddress, pool);
    }

    this.graph = this.composeGraph(Array.from(this.pools.values()));
    return this.graph;
  }

  updatePool(pool: NormalizedPoolState): Graph {
    this.assertSingleChain([pool.chainId, ...Array.from(this.pools.values()).map((candidate) => candidate.chainId)]);
    this.pools.set(pool.poolAddress, pool);
    const updatedEdges = this.createEdgesFromPool(pool);
    const canUpdateInPlace =
      updatedEdges.length > 0 &&
      updatedEdges.every(
        (edge) => this.graph.vertexIndex.has(edge.tokenIn) && this.graph.vertexIndex.has(edge.tokenOut) && this.graph.edgeIndexByKey.has(this.edgeKey(edge.poolAddress, edge.tokenIn, edge.tokenOut)),
      );

    if (!canUpdateInPlace) {
      this.graph = this.composeGraph(Array.from(this.pools.values()));
      return this.graph;
    }

    const nextEdges = this.graph.edges.map((edge) => ({ ...edge }));
    for (const edge of updatedEdges) {
      const edgeIndex = this.graph.edgeIndexByKey.get(this.edgeKey(edge.poolAddress, edge.tokenIn, edge.tokenOut));
      if (edgeIndex === undefined) {
        continue;
      }

      nextEdges[edgeIndex] = edge;
    }

    this.graph = {
      ...this.graph,
      edges: nextEdges,
      dirty: true,
      cachedRoutes: null,
    };

    return this.graph;
  }

  fromEdges(edges: GraphEdge[]): Graph {
    this.assertSingleChain(edges.map((edge) => edge.chainId));
    this.graph = this.composeGraphFromEdges(edges, edges[0]?.chainId ?? null);
    return this.graph;
  }

  getGraph(): Graph {
    return this.graph;
  }

  private composeGraph(pools: NormalizedPoolState[]): Graph {
    const edges = pools.flatMap((pool) => this.createEdgesFromPool(pool));
    return this.composeGraphFromEdges(edges, pools[0]?.chainId ?? null);
  }

  private composeGraphFromEdges(edges: GraphEdge[], chainId: number | null): Graph {
    const vertexIndex = new Map<string, number>();
    const vertices: string[] = [];

    for (const edge of edges) {
      this.ensureVertex(edge.tokenIn, vertexIndex, vertices);
      this.ensureVertex(edge.tokenOut, vertexIndex, vertices);
    }

    const sortedEdges = [...edges].sort((left, right) => {
      const leftKey = this.edgeKey(left.poolAddress, left.tokenIn, left.tokenOut);
      const rightKey = this.edgeKey(right.poolAddress, right.tokenIn, right.tokenOut);
      return leftKey.localeCompare(rightKey);
    });
    const adjacency = Array.from({ length: vertices.length }, () => [] as number[]);
    const edgeEndpoints: Array<{ from: number; to: number }> = [];
    const edgeIndexByKey = new Map<string, number>();

    sortedEdges.forEach((edge, index) => {
      const fromIndex = vertexIndex.get(edge.tokenIn);
      const toIndex = vertexIndex.get(edge.tokenOut);
      if (fromIndex !== undefined) {
        adjacency[fromIndex].push(index);
      }
      edgeEndpoints.push({ from: fromIndex ?? -1, to: toIndex ?? -1 });
      edgeIndexByKey.set(this.edgeKey(edge.poolAddress, edge.tokenIn, edge.tokenOut), index);
    });

    return {
      chainId,
      vertices,
      edges: sortedEdges,
      edgeEndpoints,
      edgeIndexByKey,
      adjacency,
      vertexIndex,
      dirty: true,
      cachedRoutes: null,
    };
  }

  private ensureVertex(token: string, vertexIndex: Map<string, number>, vertices: string[]): void {
    if (vertexIndex.has(token)) {
      return;
    }

    vertexIndex.set(token, vertices.length);
    vertices.push(token);
  }

  private createEdgesFromPool(pool: NormalizedPoolState): GraphEdge[] {
    return pool.directedPairs.flatMap((pair) => {
      if (pair.tokenIn === pair.tokenOut) {
        return [];
      }

      const rate = Number(pair.spotPrice);
      if (!Number.isFinite(rate) || rate <= 0) {
        return [];
      }

      return [{
        poolAddress: pool.poolAddress,
        dexType: pool.dexType,
        chainId: pool.chainId,
        tokenIn: pair.tokenIn,
        tokenOut: pair.tokenOut,
        feeBps: pair.feeBps,
        rate,
        weight: -Math.log(rate),
        blockNumber: pool.blockNumber,
        sampleAmountIn: '1',
        sampleAmountOut: pair.spotPrice,
      } satisfies GraphEdge];
    });
  }

  private createEmptyGraph(): Graph {
    return {
      chainId: null,
      vertices: [],
      edges: [],
      edgeEndpoints: [],
      edgeIndexByKey: new Map<string, number>(),
      adjacency: [],
      vertexIndex: new Map<string, number>(),
      dirty: false,
      cachedRoutes: null,
    };
  }

  private assertSingleChain(chainIds: number[]): void {
    const uniqueChainIds = Array.from(new Set(chainIds.filter((chainId) => Number.isFinite(chainId))));
    if (uniqueChainIds.length <= 1) {
      return;
    }

    throw new Error(`mixed-chain graph input is not supported: ${uniqueChainIds.join(',')}`);
  }

  private edgeKey(poolAddress: string, tokenIn: string, tokenOut: string): string {
    return `${poolAddress}:${tokenIn}->${tokenOut}`;
  }
}
