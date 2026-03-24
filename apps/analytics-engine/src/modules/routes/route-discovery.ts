import type { OpportunityRoute } from '@flashroute/shared/contracts/opportunity';

import type { Graph, GraphEdge } from '../graph/graph-builder';
import { getDefaultSourceTokenPriority, rankRoutes, selectSourceToken } from './route-ranking';

export interface RouteDiscoveryOptions {
  maxHops?: number;
  maxRoutes?: number;
  minProfitRatio?: number;
  sourceTokens?: string[];
  now?: () => number;
}

interface ResolvedRouteDiscoveryOptions {
  maxHops: number;
  maxRoutes: number;
  minProfitRatio: number;
  sourceTokens?: string[];
  now: () => number;
}

const DEFAULT_MAX_HOPS = 4;
const DEFAULT_MIN_PROFIT_RATIO = 0.001;
const DEFAULT_MAX_ROUTES = 50;
const RELAX_EPSILON = 1e-12;

export const discoverRoutes = (graph: Graph, options: RouteDiscoveryOptions = {}): OpportunityRoute[] => {
  const resolvedOptions = resolveOptions(options);
  const orderedSources = orderSourceTokens(graph, resolvedOptions.sourceTokens);
  const optionsKey = buildOptionsKey(resolvedOptions, orderedSources);

  if (!graph.dirty && graph.cachedRoutes?.optionsKey === optionsKey) {
    return graph.cachedRoutes.routes;
  }

  if (graph.vertices.length === 0 || graph.edges.length === 0 || orderedSources.length === 0) {
    graph.cachedRoutes = { optionsKey, routes: [] };
    graph.dirty = false;
    return [];
  }

  const routesBySignature = new Map<string, OpportunityRoute>();

  for (const sourceToken of orderedSources) {
    if (routesBySignature.size >= resolvedOptions.maxRoutes) {
      break;
    }

    const sourceIndex = graph.vertexIndex.get(sourceToken);
    if (sourceIndex === undefined) {
      continue;
    }

    const routes = findNegativeCyclesFromSource(graph, sourceIndex, orderedSources, resolvedOptions);
    for (const route of routes) {
      const previous = routesBySignature.get(route.signature);
      if (!previous) {
        routesBySignature.set(route.signature, route);
        continue;
      }

      const previousPriority = orderedSources.indexOf(previous.sourceToken);
      const nextPriority = orderedSources.indexOf(route.sourceToken);
      if (nextPriority !== -1 && (previousPriority === -1 || nextPriority < previousPriority)) {
        routesBySignature.set(route.signature, route);
        continue;
      }

      if (nextPriority === previousPriority && route.estimatedProfitRatio > previous.estimatedProfitRatio) {
        routesBySignature.set(route.signature, route);
      }
    }
  }

  const rankedRoutes = rankRoutes(Array.from(routesBySignature.values()), orderedSources).slice(0, resolvedOptions.maxRoutes);
  graph.cachedRoutes = { optionsKey, routes: rankedRoutes };
  graph.dirty = false;
  return rankedRoutes;
};

const findNegativeCyclesFromSource = (
  graph: Graph,
  sourceIndex: number,
  priority: string[],
  options: ResolvedRouteDiscoveryOptions,
): OpportunityRoute[] => {
  const vertexCount = graph.vertices.length;
  const distances = new Float64Array(vertexCount).fill(Number.POSITIVE_INFINITY);
  const predecessorVertex = new Int32Array(vertexCount).fill(-1);
  const predecessorEdge = new Int32Array(vertexCount).fill(-1);
  distances[sourceIndex] = 0;

  for (let round = 0; round < vertexCount - 1; round += 1) {
    let changed = false;

    for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 1) {
      const endpoints = graph.edgeEndpoints[edgeIndex];
      if (!endpoints || endpoints.from === -1 || endpoints.to === -1) {
        continue;
      }

      const fromDistance = distances[endpoints.from];
      if (!Number.isFinite(fromDistance)) {
        continue;
      }

      const candidateDistance = fromDistance + graph.edges[edgeIndex]!.weight;
      if (candidateDistance < distances[endpoints.to] - RELAX_EPSILON) {
        distances[endpoints.to] = candidateDistance;
        predecessorVertex[endpoints.to] = endpoints.from;
        predecessorEdge[endpoints.to] = edgeIndex;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  const routesBySignature = new Map<string, OpportunityRoute>();
  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 1) {
    const endpoints = graph.edgeEndpoints[edgeIndex];
    if (!endpoints || endpoints.from === -1 || endpoints.to === -1) {
      continue;
    }

    const fromDistance = distances[endpoints.from];
    if (!Number.isFinite(fromDistance)) {
      continue;
    }

    const candidateDistance = fromDistance + graph.edges[edgeIndex]!.weight;
    if (candidateDistance < distances[endpoints.to] - RELAX_EPSILON) {
      const route = reconstructNegativeCycle(
        graph,
        predecessorVertex,
        predecessorEdge,
        edgeIndex,
        priority,
        options,
      );
      if (!route) {
        continue;
      }

      const previous = routesBySignature.get(route.signature);
      if (!previous || route.estimatedProfitRatio > previous.estimatedProfitRatio) {
        routesBySignature.set(route.signature, route);
      }
    }
  }

  return Array.from(routesBySignature.values());
};

const reconstructNegativeCycle = (
  graph: Graph,
  predecessorVertex: Int32Array,
  predecessorEdge: Int32Array,
  candidateEdgeIndex: number,
  priority: string[],
  options: ResolvedRouteDiscoveryOptions,
): OpportunityRoute | null => {
  const candidateEndpoints = graph.edgeEndpoints[candidateEdgeIndex];
  if (!candidateEndpoints || candidateEndpoints.from === -1 || candidateEndpoints.to === -1) {
    return null;
  }

  const cyclePredecessorVertex = new Int32Array(predecessorVertex);
  const cyclePredecessorEdge = new Int32Array(predecessorEdge);
  cyclePredecessorVertex[candidateEndpoints.to] = candidateEndpoints.from;
  cyclePredecessorEdge[candidateEndpoints.to] = candidateEdgeIndex;

  let cycleVertex = candidateEndpoints.to;
  for (let step = 0; step < graph.vertices.length; step += 1) {
    cycleVertex = cyclePredecessorVertex[cycleVertex] ?? -1;
    if (cycleVertex === -1) {
      return null;
    }
  }

  const path: GraphEdge[] = [];
  const visited = new Set<number>();
  let currentVertex = cycleVertex;

  while (!visited.has(currentVertex)) {
    visited.add(currentVertex);
    const edgeIndex = cyclePredecessorEdge[currentVertex];
    const previousVertex = cyclePredecessorVertex[currentVertex];
    if (edgeIndex === -1 || previousVertex === -1) {
      return null;
    }

    const edge = graph.edges[edgeIndex];
    if (!edge) {
      return null;
    }

    path.unshift(edge);
    currentVertex = previousVertex;
  }

  const cycleStartIndex = path.findIndex((edge) => edge.tokenIn === graph.vertices[currentVertex]);
  const cyclePath = cycleStartIndex === -1 ? path : path.slice(cycleStartIndex);
  if (cyclePath.length < 2 || cyclePath.length > options.maxHops) {
    return null;
  }

  const totalWeight = cyclePath.reduce((sum, edge) => sum + edge.weight, 0);
  const estimatedProfitRatio = Math.exp(-totalWeight) - 1;
  if (estimatedProfitRatio <= options.minProfitRatio) {
    return null;
  }

  const signature = canonicalizeCycle(cyclePath, graph.chainId ?? cyclePath[0]?.chainId ?? 0);
  const tokens = Array.from(new Set(cyclePath.map((edge) => edge.tokenIn)));

  return {
    chainId: graph.chainId ?? cyclePath[0]?.chainId ?? 0,
    sourceToken: selectSourceToken(tokens, priority),
    signature,
    hops: cyclePath.length,
    totalWeight,
    estimatedProfitRatio,
    discoveredAt: options.now(),
    path: cyclePath,
  };
};

const canonicalizeCycle = (path: GraphEdge[], chainId: number): string => {
  const tuples = path.map((edge) => `${edge.tokenIn}>${edge.poolAddress}`);
  let bestRotation = tuples;

  for (let index = 1; index < tuples.length; index += 1) {
    const rotated = tuples.slice(index).concat(tuples.slice(0, index));
    if (rotated.join('|').localeCompare(bestRotation.join('|')) < 0) {
      bestRotation = rotated;
    }
  }

  return `${chainId}|${bestRotation.join('|')}`;
};

const orderSourceTokens = (graph: Graph, sourceTokens?: string[]): string[] => {
  if (sourceTokens?.length) {
    return sourceTokens.filter((token, index, list) => list.indexOf(token) === index && graph.vertexIndex.has(token));
  }

  const defaultPriority = getDefaultSourceTokenPriority(graph.chainId);
  const prioritized = defaultPriority.filter((token) => graph.vertexIndex.has(token));
  if (prioritized.length > 0) {
    return prioritized;
  }

  const remaining = [...graph.vertices].sort((left, right) => left.localeCompare(right));

  return remaining;
};

const resolveOptions = (options: RouteDiscoveryOptions): ResolvedRouteDiscoveryOptions => ({
  maxHops: options.maxHops ?? DEFAULT_MAX_HOPS,
  maxRoutes: options.maxRoutes ?? DEFAULT_MAX_ROUTES,
  minProfitRatio: options.minProfitRatio ?? DEFAULT_MIN_PROFIT_RATIO,
  sourceTokens: options.sourceTokens,
  now: options.now ?? Date.now,
});

const buildOptionsKey = (options: ResolvedRouteDiscoveryOptions, orderedSources: string[]): string =>
  JSON.stringify({
    maxHops: options.maxHops,
    maxRoutes: options.maxRoutes,
    minProfitRatio: options.minProfitRatio,
    orderedSources,
  });
