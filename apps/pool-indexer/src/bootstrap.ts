import { ChainManager } from './modules/chains/chain-manager';
import { PoolIndexer, type PoolIndexerOptions } from './modules/pools/pool-indexer';
import { TokenRegistry } from './modules/tokens/token-registry';

type BootstrapDependencies = Pick<PoolIndexerOptions, 'redis'> & {
  now?: () => number;
  freshnessTtlMs?: number;
};

export const createPoolIndexer = ({ redis, now, freshnessTtlMs }: BootstrapDependencies): {
  chainManager: ChainManager;
  tokenRegistry: TokenRegistry;
  poolIndexer: PoolIndexer;
} => {
  const chainManager = new ChainManager();
  const tokenRegistry = new TokenRegistry();
  const poolIndexer = new PoolIndexer({
    chainManager,
    tokenRegistry,
    redis,
    now,
    freshnessTtlMs,
  });

  return {
    chainManager,
    tokenRegistry,
    poolIndexer,
  };
};
