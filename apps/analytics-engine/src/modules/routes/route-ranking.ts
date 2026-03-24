import { MAJOR_TOKEN_PRIORITY_BY_CHAIN } from '@flashroute/shared/constants';
import type { OpportunityRoute } from '@flashroute/shared/contracts/opportunity';

export const getDefaultSourceTokenPriority = (chainId: number | null): string[] => {
  if (chainId === null) {
    return [];
  }

  return [...(MAJOR_TOKEN_PRIORITY_BY_CHAIN[chainId] ?? [])];
};

export const selectSourceToken = (tokens: string[], priority: string[]): string => {
  const rankedTokens = [...tokens].sort((left, right) => {
    const priorityDelta = getPriorityIndex(left, priority) - getPriorityIndex(right, priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.localeCompare(right);
  });

  return rankedTokens[0] ?? '';
};

export const rankRoutes = (routes: OpportunityRoute[], priority: string[]): OpportunityRoute[] => {
  return [...routes].sort((left, right) => {
    const priorityDelta = getPriorityIndex(left.sourceToken, priority) - getPriorityIndex(right.sourceToken, priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (left.estimatedProfitRatio !== right.estimatedProfitRatio) {
      return right.estimatedProfitRatio - left.estimatedProfitRatio;
    }

    return left.signature.localeCompare(right.signature);
  });
};

const getPriorityIndex = (token: string, priority: string[]): number => {
  const index = priority.findIndex((candidate) => candidate.toLowerCase() === token.toLowerCase());
  return index === -1 ? priority.length + 1 : index;
};
