import { describe, expect, it } from 'vitest';

import { ChainManager, MockChainAdapter } from '../chains/chain-manager';
import { TokenRegistry } from '../tokens/token-registry';
import { PoolIndexer } from './pool-indexer';

class InMemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly expirations = new Map<string, number>();
  public readonly published: Array<{ channel: string; payload: string }> = [];

  constructor(private nowMs: number) {}

  setNow(nowMs: number): void {
    this.nowMs = nowMs;
  }

  async get(key: string): Promise<string | null> {
    const expiry = this.expirations.get(key);
    if (expiry !== undefined && expiry <= this.nowMs) {
      this.values.delete(key);
      this.expirations.delete(key);
      return null;
    }

    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.values.set(key, value);
    if (ttlMs !== undefined) {
      this.expirations.set(key, this.nowMs + ttlMs);
    }
  }

  async publish(channel: string, payload: string): Promise<void> {
    this.published.push({ channel, payload });
  }
}

describe('PoolIndexer', () => {
  it('detects stale pools from freshness ttl and skips missing cache state', async () => {
    const now = { value: 1_700_000_000_000 };
    const redis = new InMemoryRedis(now.value);
    const manager = new ChainManager();
    const registry = new TokenRegistry();

    const indexer = new PoolIndexer({
      chainManager: manager,
      tokenRegistry: registry,
      redis,
      now: () => now.value,
      freshnessTtlMs: 5_000,
    });

    await redis.set('fr:pool:1:0xpool', JSON.stringify({ poolAddress: '0xpool' }));
    await redis.set('fr:pool:fresh:1:0xpool', String(now.value), 5_000);

    expect(await indexer.isPoolStale(1, '0xpool')).toBe(false);

    now.value += 6_000;
    redis.setNow(now.value);

    expect(await indexer.isPoolStale(1, '0xpool')).toBe(true);
    await expect(indexer.readCachedPools(1, ['0xpool', '0xmissing'])).resolves.toEqual({
      pools: [],
      missing: 2,
    });
  });

  it('resumes from the last checkpoint block and publishes reserve updates', async () => {
    const now = { value: 1_700_000_100_000 };
    const redis = new InMemoryRedis(now.value);
    const manager = new ChainManager();
    const registry = new TokenRegistry();
    const adapter = new MockChainAdapter({
      latestBlockNumber: 155,
      pools: [
        {
          chainId: 1,
          poolAddress: '0xpool',
          dexType: 'uniswap-v2',
          feeBps: 30,
          blockNumber: 155,
          timestamp: 1_700_000_100,
          tokens: [
            { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 2n * 10n ** 18n },
            { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 4_000n * 10n ** 6n },
          ],
        },
      ],
    });

    manager.registerChain({ chainId: 1, adapter });
    const indexer = new PoolIndexer({
      chainManager: manager,
      tokenRegistry: registry,
      redis,
      now: () => now.value,
      freshnessTtlMs: 30_000,
    });

    await redis.set('fr:sync:1:lastBlock', '150');

    const result = await indexer.syncChain(1, { mode: 'resume' });

    expect(adapter.calls.getPools).toEqual([{ fromBlock: 151, fullResync: false }]);
    expect(result).toMatchObject({
      updated: 1,
      skipped: 0,
      missing: 0,
      fromBlock: 151,
      checkpointBlock: 155,
    });
    await expect(redis.get('fr:pool:1:0xpool')).resolves.not.toBeNull();
    await expect(redis.get('fr:pool:fresh:1:0xpool')).resolves.toBe(String(now.value));
    await expect(redis.get('fr:sync:1:lastBlock')).resolves.toBe('155');

    expect(redis.published).toHaveLength(1);
    expect(redis.published[0]).toEqual({
      channel: 'fr:pool:updated',
      payload: JSON.stringify({
        chainId: 1,
        poolAddress: '0xpool',
        changedFields: ['blockNumber', 'normalizedReserves', 'spotPrices', 'timestamp'],
      }),
    });
  });

  it('supports full resync mode without using checkpoint state', async () => {
    const redis = new InMemoryRedis(1_700_000_200_000);
    const manager = new ChainManager();
    const registry = new TokenRegistry();
    const adapter = new MockChainAdapter({ latestBlockNumber: 42, pools: [] });

    manager.registerChain({ chainId: 1, adapter });

    const indexer = new PoolIndexer({
      chainManager: manager,
      tokenRegistry: registry,
      redis,
      now: () => 1_700_000_200_000,
      freshnessTtlMs: 30_000,
    });

    await redis.set('fr:sync:1:lastBlock', '40');
    await indexer.syncChain(1, { mode: 'full-resync' });

    expect(adapter.calls.getPools).toEqual([{ fromBlock: undefined, fullResync: true }]);
  });

  it('stores the fetched snapshot block rather than a later provider head', async () => {
    const redis = new InMemoryRedis(1_700_000_300_000);
    const manager = new ChainManager();
    const registry = new TokenRegistry();
    const adapter = new MockChainAdapter({
      latestBlockNumber: 175,
      snapshotBlock: 160,
      pools: [
        {
          chainId: 1,
          poolAddress: '0xsafe-checkpoint',
          dexType: 'uniswap-v2',
          feeBps: 30,
          blockNumber: 160,
          timestamp: 1_700_000_250,
          tokens: [
            { address: '0xeth', symbol: 'ETH', decimals: 18, rawBalance: 2n * 10n ** 18n },
            { address: '0xusdc', symbol: 'USDC', decimals: 6, rawBalance: 4_000n * 10n ** 6n },
          ],
        },
      ],
    });

    manager.registerChain({ chainId: 1, adapter });
    const indexer = new PoolIndexer({
      chainManager: manager,
      tokenRegistry: registry,
      redis,
      now: () => 1_700_000_300_000,
      freshnessTtlMs: 30_000,
    });

    const result = await indexer.syncChain(1, { mode: 'resume' });

    expect(result.checkpointBlock).toBe(160);
    await expect(redis.get('fr:sync:1:lastBlock')).resolves.toBe('160');
    expect(adapter.calls.getPools).toEqual([{ fromBlock: undefined, fullResync: false }]);
  });
});
