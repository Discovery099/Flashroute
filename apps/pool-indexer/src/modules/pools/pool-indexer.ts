import type { ChainManager } from '../chains/chain-manager';
import type { TokenRegistry } from '../tokens/token-registry';
import { PoolNormalizer } from './pool-normalizer';
import type { NormalizedPoolState } from './pool-types';

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  publish(channel: string, payload: string): Promise<void>;
}

export interface PoolIndexerOptions {
  chainManager: ChainManager;
  tokenRegistry: TokenRegistry;
  redis: RedisLike;
  now?: () => number;
  freshnessTtlMs?: number;
  normalizer?: PoolNormalizer;
}

export interface SyncChainOptions {
  mode: 'resume' | 'full-resync';
}

export interface SyncChainResult {
  updated: number;
  skipped: number;
  missing: number;
  fromBlock?: number;
  checkpointBlock: number;
}

export class PoolIndexer {
  private readonly now: () => number;
  private readonly freshnessTtlMs: number;
  private readonly normalizer: PoolNormalizer;

  constructor(private readonly options: PoolIndexerOptions) {
    this.now = options.now ?? Date.now;
    this.freshnessTtlMs = options.freshnessTtlMs ?? 30_000;
    this.normalizer = options.normalizer ?? new PoolNormalizer();
  }

  async syncChain(chainId: number, options: SyncChainOptions): Promise<SyncChainResult> {
    const adapter = this.options.chainManager.getAdapter(chainId);
    const checkpoint = options.mode === 'resume' ? await this.getCheckpoint(chainId) : undefined;
    const fromBlock = checkpoint === undefined ? undefined : checkpoint + 1;
    const snapshot = await adapter.getPools({ fromBlock, fullResync: options.mode === 'full-resync' });

    let updated = 0;
    let skipped = 0;
    let missing = 0;

    for (const pool of snapshot.pools) {
      const rawState = await adapter.getReserves(pool);
      if (!rawState) {
        missing += 1;
        continue;
      }

      this.options.tokenRegistry.registerTokens(chainId, rawState.tokens);

      const normalized = this.normalizer.normalize(rawState);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      const previous = await this.getCachedPool(chainId, rawState.poolAddress);
      await this.options.redis.set(this.poolKey(chainId, rawState.poolAddress), JSON.stringify(normalized));
      await this.options.redis.set(this.freshnessKey(chainId, rawState.poolAddress), String(this.now()), this.freshnessTtlMs);

      const changedFields = this.getChangedFields(previous, normalized);
      if (changedFields.length > 0) {
        await this.options.redis.publish(
          'fr:pool:updated',
          JSON.stringify({
            chainId,
            poolAddress: rawState.poolAddress,
            changedFields,
          }),
        );
      }

      updated += 1;
    }

    const checkpointBlock = snapshot.snapshotBlock;
    await this.options.redis.set(this.checkpointKey(chainId), String(checkpointBlock));

    return {
      updated,
      skipped,
      missing,
      fromBlock,
      checkpointBlock,
    };
  }

  async isPoolStale(chainId: number, poolAddress: string): Promise<boolean> {
    const freshness = await this.options.redis.get(this.freshnessKey(chainId, poolAddress));
    return freshness === null;
  }

  async readCachedPools(chainId: number, poolAddresses: string[]): Promise<{ pools: NormalizedPoolState[]; missing: number }> {
    const pools: NormalizedPoolState[] = [];
    let missing = 0;

    for (const poolAddress of poolAddresses) {
      const pool = await this.getCachedPool(chainId, poolAddress);
      if (!pool) {
        missing += 1;
        continue;
      }

      pools.push(pool);
    }

    return { pools, missing };
  }

  private async getCachedPool(chainId: number, poolAddress: string): Promise<NormalizedPoolState | null> {
    if (await this.isPoolStale(chainId, poolAddress)) {
      return null;
    }

    const payload = await this.options.redis.get(this.poolKey(chainId, poolAddress));
    return payload ? (JSON.parse(payload) as NormalizedPoolState) : null;
  }

  private async getCheckpoint(chainId: number): Promise<number | undefined> {
    const payload = await this.options.redis.get(this.checkpointKey(chainId));
    return payload === null ? undefined : Number(payload);
  }

  private getChangedFields(previous: NormalizedPoolState | null, next: NormalizedPoolState): string[] {
    const fields: Array<keyof Pick<NormalizedPoolState, 'blockNumber' | 'normalizedReserves' | 'spotPrices' | 'timestamp'>> = [
      'blockNumber',
      'normalizedReserves',
      'spotPrices',
      'timestamp',
    ];

    return fields.filter((field) => JSON.stringify(previous?.[field] ?? null) !== JSON.stringify(next[field]));
  }

  private poolKey(chainId: number, poolAddress: string): string {
    return `fr:pool:${chainId}:${poolAddress}`;
  }

  private freshnessKey(chainId: number, poolAddress: string): string {
    return `fr:pool:fresh:${chainId}:${poolAddress}`;
  }

  private checkpointKey(chainId: number): string {
    return `fr:sync:${chainId}:lastBlock`;
  }
}
