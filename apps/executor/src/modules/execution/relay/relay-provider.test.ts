import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FlashbotsRelay } from './flashbots-relay';
import { SequencerRelay } from './sequencer-relay';

describe('RelayProvider', () => {
  it('FlashbotsRelay has correct chainId and supportsFlashbots=true', () => {
    const relay = new FlashbotsRelay({ rpcEndpoint: 'https://eth.llamarpc.com' });
    expect(relay.chainId).toBe(1);
    expect(relay.supportsFlashbots).toBe(true);
  });

  it('SequencerRelay has correct chainId and supportsFlashbots=false', () => {
    const wallet = new ethers.Wallet('0x' + 'a'.repeat(64));
    const relay = new SequencerRelay({ rpcEndpoint: 'https://arb1.arbitrum.io/rpc', wallet });
    expect(relay.chainId).toBe(42161);
    expect(relay.supportsFlashbots).toBe(false);
  });

  it('both implement IRelayProvider interface', () => {
    const fb = new FlashbotsRelay({ rpcEndpoint: 'https://eth.llamarpc.com' });
    const seq = new SequencerRelay({
      rpcEndpoint: 'https://arb1.arbitrum.io/rpc',
      wallet: new ethers.Wallet('0x' + 'a'.repeat(64)),
    });

    expect(typeof fb.simulate).toBe('function');
    expect(typeof fb.submit).toBe('function');
    expect(typeof fb.waitForInclusion).toBe('function');
    expect(typeof fb.submitWithTargets).toBe('function');
    expect(typeof seq.simulate).toBe('function');
    expect(typeof seq.submit).toBe('function');
    expect(typeof seq.waitForInclusion).toBe('function');
    expect(typeof seq.submitWithTargets).toBe('function');
  });
});
