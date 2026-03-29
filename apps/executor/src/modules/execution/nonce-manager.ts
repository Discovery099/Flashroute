import type { Redis } from 'ioredis';
import type { JsonRpcProvider } from 'ethers';

const KEY_PREFIX = 'fr:nonce:';
const DIRTY_KEY_PREFIX = 'fr:dirty:nonce:';

export class NonceManager {
  constructor(private readonly redis: Redis) {}

  async reserveNonce(chainId: number): Promise<number> {
    const key = `${KEY_PREFIX}${chainId}`;
    const nonce = await this.redis.incr(key);
    return nonce;
  }

  async releaseNonce(chainId: number, nonce: number): Promise<void> {
    const dirtyKey = `${DIRTY_KEY_PREFIX}${chainId}:${nonce}`;
    await this.redis.set(dirtyKey, '1', 'EX', 3600);
  }

  async syncNonce(chainId: number, provider: JsonRpcProvider, address: string): Promise<void> {
    const key = `${KEY_PREFIX}${chainId}`;
    const nonce = await provider.getTransactionCount(address, 'pending');
    await this.redis.set(key, nonce.toString());
  }

  async getNextNonce(chainId: number): Promise<number> {
    const key = `${KEY_PREFIX}${chainId}`;
    const val = await this.redis.get(key);
    if (val === null) {
      throw new Error(`Nonce not initialized for chain ${chainId}. Call syncNonce first.`);
    }
    return parseInt(val, 10);
  }
}
