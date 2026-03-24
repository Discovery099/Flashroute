export const REDIS_KEY_PREFIX = 'fr:';
export const REDIS_QUEUE_PREFIX = 'fr:queue:';

export const REDIS_CHANNELS = {
  poolUpdate: 'fr:pool:update',
  routeDiscovered: 'fr:route:discovered',
  pendingSwap: 'fr:pending:swap',
  demandPrediction: 'fr:demand:prediction',
  executionResult: 'fr:execution:result',
  systemAlert: 'fr:system:alert',
  strategyActivated: 'fr:strategy:activated',
  strategyDeactivated: 'fr:strategy:deactivated',
  tradesQueue: 'fr:trades:queue',
  tradesLive: 'fr:trades:live',
} as const;

export const SERVICE_NAMES = [
  'api-server',
  'analytics-engine',
  'mempool-worker',
  'executor',
  'pool-indexer',
] as const;

export const MAJOR_TOKEN_PRIORITY_BY_CHAIN: Record<number, readonly string[]> = {
  1: [
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  ],
  42161: [
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    '0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9',
    '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  ],
} as const;
