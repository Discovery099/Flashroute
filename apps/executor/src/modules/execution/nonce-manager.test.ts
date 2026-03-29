import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import { NonceManager } from './nonce-manager';

describe('NonceManager', () => {
  let mockRedis: Partial<Redis>;
  let nonceManager: NonceManager;

  beforeEach(() => {
    mockRedis = {
      incr: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    nonceManager = new NonceManager(mockRedis as Redis);
  });

  it('reserves nonce by incrementing Redis counter', async () => {
    const nonce = await nonceManager.reserveNonce(1);
    expect(nonce).toBe(1);
    expect(mockRedis.incr).toHaveBeenCalledWith('fr:nonce:1');
  });

  it('releases nonce on submission failure', async () => {
    await nonceManager.releaseNonce(1, 1);
    expect(mockRedis.set).toHaveBeenCalledWith('fr:dirty:nonce:1:1', '1', 'EX', 3600);
  });

  it('syncs nonce from chain when requested', async () => {
    const mockProvider = {
      getTransactionCount: vi.fn().mockResolvedValue(5),
    };
    await nonceManager.syncNonce(1, mockProvider as any, '0x1234');
    expect(mockRedis.set).toHaveBeenCalledWith('fr:nonce:1', '5');
    expect(mockProvider.getTransactionCount).toHaveBeenCalledWith('0x1234', 'pending');
  });

  it('throws when getting nonce before initialization', async () => {
    mockRedis.get = vi.fn().mockResolvedValue(null);
    await expect(nonceManager.getNextNonce(1)).rejects.toThrow('Nonce not initialized');
  });

  it('returns stored nonce on getNextNonce', async () => {
    mockRedis.get = vi.fn().mockResolvedValue('10');
    const nonce = await nonceManager.getNextNonce(1);
    expect(nonce).toBe(10);
  });
});
