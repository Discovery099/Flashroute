import type { OpportunityApiItem } from './api';

export type OpportunityItem = OpportunityApiItem & {
  expiresAt: number;
  isExpiring: boolean;
};

export const toOpportunityItem = (item: OpportunityApiItem, now: number = Date.now()): OpportunityItem => ({
  ...item,
  expiresAt: now + item.expiresInMs,
  isExpiring: false,
});

export const getOpportunityRouteLabel = (item: Pick<OpportunityApiItem, 'routePath'>) => {
  const tokens = item.routePath.flatMap((segment, index) => (index === 0 ? [segment.tokenIn, segment.tokenOut] : [segment.tokenOut]));
  return tokens.join(' -> ');
};
