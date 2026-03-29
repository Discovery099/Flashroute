import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TxTracker } from './tx-tracker';

describe('TxTracker', () => {
  let mockProvider: any;
  let txTracker: TxTracker;

  beforeEach(() => {
    mockProvider = {
      getTransactionReceipt: vi.fn(),
      getBlockNumber: vi.fn().mockResolvedValue(100),
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }),
    };
    txTracker = new TxTracker(mockProvider);
  });

  it('returns success when receipt status is 1', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockNumber: 100,
      gasUsed: 150000n,
      gasPrice: 30_000_000_000n,
    });

    const result = await txTracker.waitForReceipt('0xtxhash', 25);
    expect(result.success).toBe(true);
    expect(result.blockNumber).toBe(100);
    expect(result.gasUsed).toBe(150000n);
    expect(result.gasPriceGwei).toBe(30);
  });

  it('returns failure when receipt status is 0', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue({
      status: 0,
      blockNumber: 100,
      gasUsed: 150000n,
      gasPrice: 30_000_000_000n,
    });

    const result = await txTracker.waitForReceipt('0xtxhash', 25);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('onchain_revert');
  });

  it('returns not_included after maxBlocks exceeded', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue(null);
    mockProvider.getNetwork.mockImplementation(() => Promise.resolve({ chainId: 137n }));
    let blockCount = 100;
    mockProvider.getBlockNumber.mockImplementation(() => Promise.resolve(blockCount++));

    const result = await txTracker.waitForReceipt('0xtxhash', 5);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_included');
  });
});
