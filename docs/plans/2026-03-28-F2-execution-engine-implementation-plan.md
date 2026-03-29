# F2 Execution Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the backend execution engine that subscribes to profitable routes, constructs and submits flash loan arbitrage transactions via Flashbots (ETH) or direct submission (Arbitrum), and tracks execution results.

**Architecture:** Worker process in `apps/executor/src/workers/executor.ts` that orchestrates: route received → simulate (existing) → build RouteParams → sign → submit via relay → track → record result. Gated behind `EXECUTION_ENABLED`.

**Tech Stack:** ethers v6, @flashbots/sdk, ioredis, pino (via @flashroute/shared)

---

## Prerequisites

Before starting, verify these packages exist and note their exports:
- `packages/shared/src/constants.ts` — `REDIS_CHANNELS` (already confirmed)
- `packages/shared/src/logger.ts` — `createLogger()`
- `packages/shared/src/errors.ts` — `BlockchainError`, `AppError`
- `packages/db/src/` — Redis client factory (confirm before using)
- `packages/config/src/` — `loadEnv()` (confirm before using)

Also verify the `FlashRouteExecutor` contract ABI is accessible. Check `packages/contracts/src/FlashRouteExecutor.sol` for the exact function signature:
```
executeArbitrage(RouteParams calldata params)
RouteParams: (uint8, address, address, uint256, uint256, uint256, SwapHop[])
SwapHop: (uint8, address, address, address, uint256, uint256)
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/executor/package.json`

**Step 1: Add dependencies**

```bash
cd apps/executor
pnpm add ethers @flashbots/sdk ioredis
```

**Step 2: Commit**

```bash
git add apps/executor/package.json
git commit -m "feat(executor): add ethers v6, @flashbots/sdk, ioredis"
```

---

## Task 2: Execution Config Schema

**Files:**
- Create: `apps/executor/src/config/execution.config.ts`
- Test: `apps/executor/src/config/execution.config.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('executionConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('parses EXECUTION_ENABLED=true', () => {
    process.env.EXECUTION_ENABLED = 'true';
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses EXECUTION_ENABLED=false', () => {
    process.env.EXECUTION_ENABLED = 'false';
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.enabled).toBe(false);
  });

  it('throws if EXECUTOR_PRIVATE_KEY missing when enabled', () => {
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = '';
    const { loadExecutionConfig } = await import('./execution.config');
    expect(() => loadExecutionConfig()).toThrow('EXECUTOR_PRIVATE_KEY');
  });

  it('has sensible defaults for optional fields', () => {
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = '0x' + 'a'.repeat(64);
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.stalenessThresholdMs).toBe(6000);
    expect(config.gasReserveEth).toBe(0.05);
    expect(config.maxPendingPerChain).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/config/execution.config.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write minimal implementation**

```typescript
// apps/executor/src/config/execution.config.ts

export interface ExecutionConfig {
  enabled: boolean;
  privateKey: string;
  chains: number[];
  stalenessThresholdMs: number;
  gasReserveEth: number;
  maxPendingPerChain: number;
  flashbotsRelayUrl: string;
}

export function loadExecutionConfig(): ExecutionConfig {
  const enabled = process.env.EXECUTION_ENABLED === 'true';
  const privateKey = process.env.EXECUTOR_PRIVATE_KEY ?? '';

  if (enabled && !privateKey) {
    throw new Error('EXECUTOR_PRIVATE_KEY is required when EXECUTION_ENABLED=true');
  }

  return {
    enabled,
    privateKey,
    chains: (process.env.EXECUTOR_CHAINS ?? '1,42161')
      .split(',')
      .map((s) => parseInt(s.trim(), 10)),
    stalenessThresholdMs: parseInt(process.env.EXECUTOR_STALENESS_THRESHOLD_MS ?? '6000', 10),
    gasReserveEth: parseFloat(process.env.EXECUTOR_GAS_RESERVE_ETH ?? '0.05'),
    maxPendingPerChain: parseInt(process.env.EXECUTOR_MAX_PENDING_PER_CHAIN ?? '1', 10),
    flashbotsRelayUrl: process.env.FLASHBOTS_RELAY_URL ?? 'https://relay.flashbots.net',
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/config/execution.config.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/config/execution.config.ts apps/executor/src/config/execution.config.test.ts
git commit -m "feat(executor): add execution config schema with EXECUTION_ENABLED gate"
```

---

## Task 3: Nonce Manager

**Files:**
- Create: `apps/executor/src/modules/execution/nonce-manager.ts`
- Test: `apps/executor/src/modules/execution/nonce-manager.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';

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
    await nonceManager.reserveNonce(1);
    await nonceManager.releaseNonce(1, 1);
    expect(mockRedis.set).toHaveBeenCalledWith('fr:dirty:nonce:1:1', '1', 'EX', '1h');
  });

  it('syncs nonce from chain when Redis is empty', async () => {
    const mockProvider = {
      getTransactionCount: vi.fn().mockResolvedValue(5),
    };
    await nonceManager.syncNonce(1, mockProvider as any);
    expect(mockRedis.set).toHaveBeenCalledWith('fr:nonce:1', '5');
    expect(mockProvider.getTransactionCount).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/execution/nonce-manager.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/execution/nonce-manager.ts

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

  async syncNonce(chainId: number, provider: JsonRpcProvider): Promise<void> {
    const key = `${KEY_PREFIX}${chainId}`;
    const addresses = await provider.listAccounts();
    if (addresses.length === 0) {
      throw new Error(`No accounts available for chain ${chainId}`);
    }
    const address = addresses[0].address;
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
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/execution/nonce-manager.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/execution/nonce-manager.ts apps/executor/src/modules/execution/nonce-manager.test.ts
git commit -m "feat(executor): add NonceManager with Redis-backed nonce tracking"
```

---

## Task 4: Flash Loan Provider Interface + Implementations

**Files:**
- Create: `apps/executor/src/modules/execution/flash-loan-provider.ts`
- Create: `apps/executor/src/modules/execution/providers/balancer-provider.ts`
- Create: `apps/executor/src/modules/execution/providers/aave-v3-provider.ts`
- Test: `apps/executor/src/modules/execution/flash-loan-provider.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';

describe('FlashLoanProvider', () => {
  it('BalancerProvider has 0% fee', async () => {
    const { BalancerProvider } = await import('./providers/balancer-provider');
    const provider = new BalancerProvider();
    expect(provider.feeBps).toBe(0);
    expect(provider.name).toBe('balancer');
  });

  it('AaveV3Provider has 0.05% fee', async () => {
    const { AaveV3Provider } = await import('./providers/aave-v3-provider');
    const provider = new AaveV3Provider();
    expect(provider.feeBps).toBe(5);
    expect(provider.name).toBe('aave-v3');
  });

  it('both providers implement IFlashLoanProvider interface', async () => {
    const { BalancerProvider } = await import('./providers/balancer-provider');
    const { AaveV3Provider } = await import('./providers/aave-v3-provider');
    const balancer = new BalancerProvider();
    const aave = new AaveV3Provider();

    expect(typeof balancer.getQuote).toBe('function');
    expect(typeof balancer.buildCalldata).toBe('function');
    expect(typeof aave.getQuote).toBe('function');
    expect(typeof aave.buildCalldata).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/execution/flash-loan-provider.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write interface**

```typescript
// apps/executor/src/modules/execution/flash-loan-provider.ts

import type { Bytes } from 'ethers';

export interface FlashLoanQuote {
  provider: string;
  feeBps: number;
  estimatedCost: bigint; // in token units
}

export interface IFlashLoanProvider {
  readonly name: 'balancer' | 'aave-v3';
  readonly feeBps: number;
  readonly gasOverhead: number;

  getQuote(token: string, amount: bigint): Promise<FlashLoanQuote>;
  buildCalldata(token: string, amount: bigint): Promise<Bytes>;
  getVaultAddress(chainId: number): string;
}
```

**Step 4: Write BalancerProvider**

```typescript
// apps/executor/src/modules/execution/providers/balancer-provider.ts

import { ethers } from 'ethers';
import type { IFlashLoanProvider, FlashLoanQuote } from '../flash-loan-provider';

const BALANCER_VAULT_BY_CHAIN: Record<number, string> = {
  1: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  42161: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
};

export class BalancerProvider implements IFlashLoanProvider {
  readonly name = 'balancer' as const;
  readonly feeBps = 0;
  readonly gasOverhead = 35000; // flash loan overhead gas

  async getQuote(token: string, amount: bigint): Promise<FlashLoanQuote> {
    const estimatedCost = (amount * BigInt(this.feeBps)) / 10_000n;
    return {
      provider: this.name,
      feeBps: this.feeBps,
      estimatedCost,
    };
  }

  async buildCalldata(token: string, amount: bigint): Promise<ethers.Bytes> {
    // The flash loan calldata is built by the transaction builder
    // which encodes the full RouteParams struct.
    // This method can return any provider-specific data needed.
    // For Balancer, no additional data needed — vault is determined by chain.
    return ethers.toUtf8Bytes('');
  }

  getVaultAddress(chainId: number): string {
    const vault = BALANCER_VAULT_BY_CHAIN[chainId];
    if (!vault) throw new Error(`Balancer not supported on chain ${chainId}`);
    return vault;
  }
}
```

**Step 5: Write AaveV3Provider**

```typescript
// apps/executor/src/modules/execution/providers/aave-v3-provider.ts

import { ethers } from 'ethers';
import type { IFlashLoanProvider, FlashLoanQuote } from '../flash-loan-provider';

const AAVE_V3_POOL_BY_CHAIN: Record<number, string> = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

export class AaveV3Provider implements IFlashLoanProvider {
  readonly name = 'aave-v3' as const;
  readonly feeBps = 5; // 0.05%
  readonly gasOverhead = 40000; // slightly higher overhead than Balancer

  async getQuote(token: string, amount: bigint): Promise<FlashLoanQuote> {
    const estimatedCost = (amount * BigInt(this.feeBps)) / 10_000n;
    return {
      provider: this.name,
      feeBps: this.feeBps,
      estimatedCost,
    };
  }

  async buildCalldata(token: string, amount: bigint): Promise<ethers.Bytes> {
    return ethers.toUtf8Bytes('');
  }

  getPoolAddress(chainId: number): string {
    const pool = AAVE_V3_POOL_BY_CHAIN[chainId];
    if (!pool) throw new Error(`Aave V3 not supported on chain ${chainId}`);
    return pool;
  }
}
```

**Step 6: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/execution/flash-loan-provider.test.ts
# Expected: PASS
```

**Step 7: Commit**

```bash
git add apps/executor/src/modules/execution/flash-loan-provider.ts apps/executor/src/modules/execution/providers/
git commit -m "feat(executor): add FlashLoanProvider interface with Balancer and Aave V3 implementations"
```

---

## Task 5: Transaction Builder

**Files:**
- Create: `apps/executor/src/modules/execution/transaction-builder.ts`
- Test: `apps/executor/src/modules/execution/transaction-builder.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { encodeRouteParams, decodeRouteParams } from './transaction-builder';
import type { SimulationResult } from '@flashroute/executor/modules/simulation/profit-simulator';

describe('TransactionBuilder', () => {
  it('encodes RouteParams to bytes matching contract ABI', () => {
    const params = {
      flashLoanProvider: 1 as const, // Balancer
      flashLoanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      flashLoanVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      flashLoanAmount: 1_000_000_000n, // 1000 USDC (6 decimals)
      minProfit: 10_000_000n, // 10 USDC profit threshold
      deadline: Math.floor(Date.now() / 1000) + 300,
      hops: [
        {
          dexType: 1 as const, // V2
          router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
          tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: 1_000_000_000n,
          sqrtPriceLimitX96: 0n,
        },
      ],
    };

    const encoded = encodeRouteParams(params);
    expect(encoded.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(encoded) || encoded instanceof Uint8Array).toBe(true);
  });

  it('decodes back to original values', () => {
    const params = {
      flashLoanProvider: 1 as const,
      flashLoanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      flashLoanVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      flashLoanAmount: 1_000_000_000n,
      minProfit: 0n,
      deadline: 9999999999,
      hops: [
        {
          dexType: 2 as const, // V3
          router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
          tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenOut: '0x6B175474E89094C44Da98b954E960e9DAdC8095a3E',
          amountIn: 1n,
          sqrtPriceLimitX96: 4295128740n,
        },
      ],
    };

    const encoded = encodeRouteParams(params);
    const decoded = decodeRouteParams(encoded);

    expect(decoded.flashLoanProvider).toBe(1);
    expect(decoded.flashLoanAmount).toBe(1_000_000_000n);
    expect(decoded.hops[0].dexType).toBe(2);
    expect(decoded.hops[0].sqrtPriceLimitX96).toBe(4295128740n);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/execution/transaction-builder.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/execution/transaction-builder.ts

import { ethers } from 'ethers';

// Matches the SwapHop struct in FlashRouteExecutor.sol
export interface SwapHopStruct {
  dexType: number; // 1=V2, 2=V3, 3=Curve, 4=Balancer
  router: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  sqrtPriceLimitX96: bigint;
}

// Matches the RouteParams struct in FlashRouteExecutor.sol
export interface RouteParamsStruct {
  flashLoanProvider: number; // 1=Balancer, 2=AaveV3
  flashLoanToken: string;
  flashLoanVault: string;
  flashLoanAmount: bigint;
  minProfit: bigint;
  deadline: number;
  hops: SwapHopStruct[];
}

// ABI types for encoding
const SWAP_HOP_TYPES = ['uint8', 'address', 'address', 'address', 'uint256', 'uint256'];
const ROUTE_PARAMS_TYPES = [
  'uint8',
  'address',
  'address',
  'uint256',
  'uint256',
  'uint256',
  'SwapHop[]',
];

export function encodeRouteParams(params: RouteParamsStruct): Uint8Array {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const encoded = abiCoder.encode(
    ['uint8', 'address', 'address', 'uint256', 'uint256', 'uint256', '(uint8,address,address,address,uint256,uint256)[]'],
    [
      params.flashLoanProvider,
      params.flashLoanToken,
      params.flashLoanVault,
      params.flashLoanAmount,
      params.minProfit,
      params.deadline,
      params.hops.map((hop) => [
        hop.dexType,
        hop.router,
        hop.tokenIn,
        hop.tokenOut,
        hop.amountIn,
        hop.sqrtPriceLimitX96,
      ]),
    ]
  );

  // Remove the 0x prefix and decode as hex
  return ethers.getBytes(encoded);
}

export function decodeRouteParams(data: Uint8Array): RouteParamsStruct {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const hexString = ethers.hexlify(data);

  const decoded = abiCoder.decode(
    ['uint8', 'address', 'address', 'uint256', 'uint256', 'uint256', '(uint8,address,address,address,uint256,uint256)[]'],
    hexString
  );

  return {
    flashLoanProvider: decoded[0] as number,
    flashLoanToken: decoded[1] as string,
    flashLoanVault: decoded[2] as string,
    flashLoanAmount: decoded[3] as bigint,
    minProfit: decoded[4] as bigint,
    deadline: Number(decoded[5]),
    hops: (decoded[6] as any[]).map((hop) => ({
      dexType: hop[0] as number,
      router: hop[1] as string,
      tokenIn: hop[2] as string,
      tokenOut: hop[3] as string,
      amountIn: hop[4] as bigint,
      sqrtPriceLimitX96: hop[5] as bigint,
    })),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/execution/transaction-builder.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/execution/transaction-builder.ts apps/executor/src/modules/execution/transaction-builder.test.ts
git commit -m "feat(executor): add TransactionBuilder for RouteParams ABI encoding"
```

---

## Task 6: Relay Provider Interface + Flashbots Implementation

**Files:**
- Create: `apps/executor/src/modules/execution/relay/relay-provider.ts`
- Create: `apps/executor/src/modules/execution/relay/flashbots-relay.ts`
- Create: `apps/executor/src/modules/execution/relay/sequencer-relay.ts`
- Test: `apps/executor/src/modules/execution/relay/flashbots-relay.test.ts`

**Step 1: Write interface test**

```typescript
import { describe, it, expect } from 'vitest';
import type { IRelayProvider, BundleResult, SubmissionTarget } from './relay-provider';

describe('IRelayProvider', () => {
  it('FlashbotsRelay and SequencerRelay both implement IRelayProvider', async () => {
    const { FlashbotsRelay } = await import('./flashbots-relay');
    const { SequencerRelay } = await import('./sequencer-relay');

    const fb = new FlashbotsRelay({} as any);
    const seq = new SequencerRelay({} as any);

    expect(typeof fb.simulate).toBe('function');
    expect(typeof fb.submit).toBe('function');
    expect(typeof fb.waitForInclusion).toBe('function');
    expect(typeof seq.submit).toBe('function');
    expect(typeof seq.waitForInclusion).toBe('function');
  });
});
```

**Step 2: Write relay interface**

```typescript
// apps/executor/src/modules/execution/relay/relay-provider.ts

import type { ethers } from 'ethers';

export interface SubmissionTarget {
  blockNumber: number; // target block (N+1 or N+2)
}

export interface BundleResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  reason?: string;
}

export interface IRelayProvider {
  readonly chainId: number;
  readonly supportsFlashbots: boolean;

  simulate(
    signedTx: string,
    targetBlock: number,
    coinbase: string
  ): Promise<{ success: boolean; reason?: string }>;

  submit(targetBlock: number, signedTx: string): Promise<string>; // returns bundleHash

  waitForInclusion(
    bundleHash: string,
    maxBlocks: number
  ): Promise<BundleResult>;

  submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>>; // blockNumber → bundleHash
}
```

**Step 3: Write FlashbotsRelay implementation**

```typescript
// apps/executor/src/modules/execution/relay/flashbots-relay.ts

import { FlashbotsBundleProvider, FlashbotsBundleRawTx } from '@flashbots/sdk';
import { ethers } from 'ethers';
import type { IRelayProvider, BundleResult, SubmissionTarget } from './relay-provider';
import { Logger } from '@flashroute/shared';

export interface FlashbotsRelayOptions {
  authKey: string;
  rpcEndpoint: string;
  relayUrl?: string;
}

export class FlashbotsRelay implements IRelayProvider {
  readonly chainId: number;
  readonly supportsFlashbots = true;

  private provider: ethers.JsonRpcProvider;
  private flashbotsProvider: InstanceType<typeof FlashbotsBundleProvider>;
  private logger: Logger;

  constructor(options: FlashbotsRelayOptions) {
    this.chainId = options.rpcEndpoint.includes('arbitrum') ? 42161 : 1;
    this.provider = new ethers.JsonRpcProvider(options.rpcEndpoint);
    this.logger = new Logger({ service: 'flashbots-relay' });
  }

  async initialize(signer: ethers.Signer): Promise<void> {
    this.flashbotsProvider = await FlashbotsBundleProvider.create(
      this.provider as any,
      signer as any,
      this.chainId,
      this.options?.relayUrl ?? 'https://relay.flashbots.net'
    );
  }

  async simulate(
    signedTx: string,
    targetBlock: number,
    _coinbase: string
  ): Promise<{ success: boolean; reason?: string }> {
    const bundle: FlashbotsBundleRawTx[] = [{ signedTransaction: signedTx }];

    try {
      const simulation = await this.flashbotsProvider.simulate(bundle, targetBlock);

      if ('error' in simulation) {
        return { success: false, reason: simulation.error.message };
      }

      const results = 'results' in simulation ? simulation.results : [];
      for (const result of results) {
        if ('error' in result) {
          return { success: false, reason: result.error.message };
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, reason: String(err) };
    }
  }

  async submit(targetBlock: number, signedTx: string): Promise<string> {
    const bundle: FlashbotsBundleRawTx[] = [{ signedTransaction: signedTx }];
    const response = await this.flashbotsProvider.sendBundle(bundle, targetBlock);

    if (!response.bundleHash) {
      throw new Error(`Flashbots submission failed: ${JSON.stringify(response)}`);
    }

    return response.bundleHash;
  }

  async waitForInclusion(
    bundleHash: string,
    maxBlocks: number = 3
  ): Promise<BundleResult> {
    for (let i = 0; i < maxBlocks; i++) {
      const currentBlock = await this.provider.getBlockNumber();

      try {
        const stats = await this.flashbotsProvider.getBundleStatsV2(bundleHash, currentBlock);

        if (stats.isHighPriority) {
          const receipts = await this.flashbotsProvider.getBundleTransactions(
            bundleHash,
            currentBlock
          );
          for (const receipt of receipts) {
            if (receipt.reverted === false) {
              return {
                success: true,
                txHash: receipt.transactionHash,
                blockNumber: currentBlock,
              };
            }
          }
        }
      } catch (err) {
        this.logger.warn({ err, bundleHash, block: currentBlock }, 'Error polling bundle stats');
      }

      // Wait ~12s before next poll (one block on Ethereum)
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }

    return {
      success: false,
      reason: 'not_included',
      error: `Bundle not included after ${maxBlocks} blocks`,
    };
  }

  async submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>> {
    const results = new Map<number, string>();

    for (const target of targets) {
      const bundleHash = await this.submit(target.blockNumber, signedTx);
      results.set(target.blockNumber, bundleHash);
    }

    return results;
  }
}
```

**Step 4: Write SequencerRelay (Arbitrum)**

```typescript
// apps/executor/src/modules/execution/relay/sequencer-relay.ts

import { ethers } from 'ethers';
import type { IRelayProvider, BundleResult, SubmissionTarget } from './relay-provider';
import { Logger } from '@flashroute/shared';

export class SequencerRelay implements IRelayProvider {
  readonly chainId: number = 42161;
  readonly supportsFlashbots = false;

  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private logger: Logger;

  constructor(options: { rpcEndpoint: string; wallet: ethers.Wallet }) {
    this.provider = new ethers.JsonRpcProvider(options.rpcEndpoint);
    this.wallet = options.wallet;
    this.logger = new Logger({ service: 'sequencer-relay' });
  }

  async simulate(
    signedTx: string,
    targetBlock: number,
    _coinbase: string
  ): Promise<{ success: boolean; reason?: string }> {
    // No simulation on Arbitrum — submit directly
    return { success: true };
  }

  async submit(_targetBlock: number, signedTx: string): Promise<string> {
    const tx = await this.provider.broadcastTransaction(signedTx);
    return tx.hash;
  }

  async waitForInclusion(
    txHash: string,
    maxBlocks: number = 25
  ): Promise<BundleResult> {
    for (let i = 0; i < maxBlocks; i++) {
      const currentBlock = await this.provider.getBlockNumber();

      try {
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          return {
            success: receipt.status === 1,
            txHash,
            blockNumber: receipt.blockNumber,
            error: receipt.status === 0 ? 'Transaction reverted on-chain' : undefined,
          };
        }
      } catch (err) {
        this.logger.warn({ err, txHash, block: currentBlock }, 'Error polling tx receipt');
      }

      // Wait ~250ms (Arbitrum block time)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return {
      success: false,
      reason: 'not_included',
      error: `Transaction not included after ${maxBlocks} blocks`,
    };
  }

  async submitWithTargets(
    targets: SubmissionTarget[],
    signedTx: string
  ): Promise<Map<number, string>> {
    // On Arbitrum, submit once and the sequencer will include it
    // The target parameter is informational — same tx for all targets
    const txHash = await this.submit(targets[0]?.blockNumber ?? 0, signedTx);
    const results = new Map<number, string>();
    for (const target of targets) {
      results.set(target.blockNumber, txHash);
    }
    return results;
  }
}
```

**Step 5: Run tests and fix any issues**

```bash
cd apps/executor && pnpm test src/modules/execution/relay/
# Expected: compile errors — fix until passing
```

**Step 6: Commit**

```bash
git add apps/executor/src/modules/execution/relay/
git commit -m "feat(executor): add RelayProvider interface with Flashbots and Sequencer implementations"
```

---

## Task 7: Transaction Tracker

**Files:**
- Create: `apps/executor/src/modules/execution/tx-tracker.ts`
- Test: `apps/executor/src/modules/execution/tx-tracker.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ethers } from 'ethers';

describe('TxTracker', () => {
  let mockProvider: any;
  let txTracker: TxTracker;

  beforeEach(() => {
    mockProvider = {
      getTransactionReceipt: vi.fn(),
      getBlockNumber: vi.fn().mockResolvedValue(100),
    };
    txTracker = new TxTracker(mockProvider);
  });

  it('returns success when receipt status is 1', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockNumber: 100,
      gasUsed: 150000n,
      effectiveGasPrice: 30_000_000_000n,
    });

    const result = await txTracker.waitForReceipt('0xtxhash', 25);
    expect(result.success).toBe(true);
    expect(result.blockNumber).toBe(100);
  });

  it('returns failure when receipt status is 0', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue({
      status: 0,
      blockNumber: 100,
      gasUsed: 150000n,
      effectiveGasPrice: 30_000_000_000n,
    });

    const result = await txTracker.waitForReceipt('0xtxhash', 25);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('onchain_revert');
  });

  it('returns not_included after timeout', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue(null);
    mockProvider.getBlockNumber.mockResolvedValue(125);

    const result = await txTracker.waitForReceipt('0xtxhash', 25);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_included');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/modules/execution/tx-tracker.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

```typescript
// apps/executor/src/modules/execution/tx-tracker.ts

import type { ethers } from 'ethers';

export interface TxReceipt {
  success: boolean;
  txHash: string;
  blockNumber?: number;
  gasUsed?: bigint;
  gasPriceGwei?: number;
  reason?: string;
}

export class TxTracker {
  constructor(private readonly provider: ethers.JsonRpcProvider) {}

  async waitForReceipt(txHash: string, maxBlocks: number = 25): Promise<TxReceipt> {
    const startBlock = await this.provider.getBlockNumber();

    while (true) {
      const currentBlock = await this.provider.getBlockNumber();

      if (currentBlock - startBlock > maxBlocks) {
        return {
          success: false,
          txHash,
          reason: 'not_included',
        };
      }

      try {
        const receipt = await this.provider.getTransactionReceipt(txHash);

        if (receipt) {
          if (receipt.status === 1) {
            return {
              success: true,
              txHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed,
              gasPriceGwei: Number(receipt.gasPrice) / 1e9,
            };
          } else {
            return {
              success: false,
              txHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed,
              gasPriceGwei: Number(receipt.gasPrice) / 1e9,
              reason: 'onchain_revert',
            };
          }
        }
      } catch (err) {
        // Receipt not ready yet, continue polling
      }

      // Wait ~12s for Ethereum, ~250ms for Arbitrum
      const chainId = (await this.provider.getNetwork()).chainId;
      const delay = chainId === 1n ? 12000 : 250;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/executor && pnpm test src/modules/execution/tx-tracker.test.ts
# Expected: PASS
```

**Step 5: Commit**

```bash
git add apps/executor/src/modules/execution/tx-tracker.ts apps/executor/src/modules/execution/tx-tracker.test.ts
git commit -m "feat(executor): add TxTracker for receipt polling and status resolution"
```

---

## Task 8: Execution Engine (Orchestrator)

**Files:**
- Create: `apps/executor/src/services/execution-engine.ts`
- Test: `apps/executor/src/services/execution-engine.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionEngine } from './execution-engine';

describe('ExecutionEngine', () => {
  let mockConfig: any;
  let mockNonceManager: any;
  let mockNonceManager: any;
  let mockTxTracker: any;
  let mockTradeService: any;
  let mockRedis: any;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      privateKey: '0x' + 'a'.repeat(64),
      chains: [1],
      stalenessThresholdMs: 6000,
      gasReserveEth: 0.05,
      maxPendingPerChain: 1,
      flashbotsRelayUrl: 'https://relay.flashbots.net',
    };

    mockNonceManager = {
      reserveNonce: vi.fn().mockResolvedValue(0),
      releaseNonce: vi.fn(),
      syncNonce: vi.fn(),
    };

    mockTxTracker = {
      waitForReceipt: vi.fn(),
    };

    mockTradeService = {
      createTrade: vi.fn().mockResolvedValue({ id: 'trade-1' }),
      updateTrade: vi.fn(),
    };

    mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    };
  });

  it('skips execution when EXECUTION_ENABLED=false', async () => {
    mockConfig.enabled = false;
    const engine = new ExecutionEngine(mockConfig, mockNonceManager, mockTxTracker, mockTradeService, mockRedis, []);

    const result = await engine.execute(mockRoute(), mockStrategy());
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('execution_disabled');
  });

  it('creates trade record before submission', async () => {
    const engine = buildEngine();
    await engine.execute(mockRoute(), mockStrategy());

    expect(mockTradeService.createTrade).toHaveBeenCalled();
    const createCall = mockTradeService.createTrade.mock.calls[0][0];
    expect(createCall.status).toBe('submitted');
  });

  it('reserves nonce before signing', async () => {
    const engine = buildEngine();
    await engine.execute(mockRoute(), mockStrategy());

    expect(mockNonceManager.reserveNonce).toHaveBeenCalledWith(1);
  });

  it('releases nonce on submission failure', async () => {
    const engine = buildEngine();
    mockNonceManager.reserveNonce.mockRejectedValue(new Error('nonce error'));

    await engine.execute(mockRoute(), mockStrategy());

    expect(mockNonceManager.releaseNonce).toHaveBeenCalled();
  });
});

function buildEngine() {
  return new ExecutionEngine(mockConfig, mockNonceManager, mockTxTracker, mockTradeService, mockRedis, []);
}
```

**Step 2: Run test to verify it fails**

```bash
cd apps/executor && pnpm test src/services/execution-engine.test.ts
# Expected: FAIL — module not found
```

**Step 3: Write implementation**

The ExecutionEngine orchestrates the full flow. It needs to:
1. Check `EXECUTION_ENABLED`
2. Validate simulation freshness and gas price
3. Acquire execution lock (Redis SETNX)
4. Reserve nonce
5. Sign transaction with executor wallet
6. Submit via relay (N+1 and N+2 targets)
7. Create trade record
8. Track transaction
9. Record result to TradeService
10. Release lock

```typescript
// apps/executor/src/services/execution-engine.ts

import { ethers } from 'ethers';
import { FlashbotsRelay } from '../modules/execution/relay/flashbots-relay';
import { SequencerRelay } from '../modules/execution/relay/sequencer-relay';
import type { IRelayProvider } from '../modules/execution/relay/relay-provider';
import { NonceManager } from '../modules/execution/nonce-manager';
import { TxTracker } from '../modules/execution/tx-tracker';
import { encodeRouteParams } from '../modules/execution/transaction-builder';
import type { RouteParamsStruct } from '../modules/execution/transaction-builder';
import { Logger } from '@flashroute/shared';
import type { ExecutionConfig } from '../config/execution.config';
import type { Redis } from 'ioredis';

export interface ExecutionDecision {
  approved: boolean;
  reasons: string[];
  metrics?: Record<string, unknown>;
}

export interface ExecutionResult {
  tradeId?: string;
  txHash?: string;
  status: 'skipped' | 'submitted' | 'included' | 'reverted' | 'failed';
  reason?: string;
  error?: string;
}

export class ExecutionEngine {
  private wallet: ethers.Wallet;
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();
  private relays: Map<number, IRelayProvider> = new Map();
  private logger: Logger;

  constructor(
    private readonly config: ExecutionConfig,
    private readonly nonceManager: NonceManager,
    private readonly txTracker: TxTracker,
    private readonly tradeService: any, // TradeService from apps/api
    private readonly redis: Redis,
    private readonly rpcEndpoints: Record<number, string>
  ) {
    this.logger = new Logger({ service: 'execution-engine' });
    this.wallet = new ethers.Wallet(config.privateKey);

    for (const [chainId, endpoint] of Object.entries(rpcEndpoints)) {
      const provider = new ethers.JsonRpcProvider(endpoint);
      this.providers.set(parseInt(chainId), provider);

      const relay =
        parseInt(chainId) === 1
          ? new FlashbotsRelay({ rpcEndpoint: endpoint, authKey: 'default' })
          : new SequencerRelay({ rpcEndpoint: endpoint, wallet: this.wallet });

      this.relays.set(parseInt(chainId), relay);
    }
  }

  async shouldExecute(route: any, strategy: any): Promise<ExecutionDecision> {
    const reasons: string[] = [];

    if (!this.config.enabled) {
      return { approved: false, reasons: ['EXECUTION_ENABLED=false'] };
    }

    const simulationAge = Date.now() - route.simulatedAt;
    if (simulationAge > this.config.stalenessThresholdMs) {
      reasons.push(`stale_opportunity: simulation is ${simulationAge}ms old`);
    }

    const provider = this.providers.get(route.chainId);
    if (!provider) {
      reasons.push(`unknown_chain: ${route.chainId}`);
    }

    if (reasons.length > 0) {
      return { approved: false, reasons };
    }

    return { approved: true, reasons: [], metrics: {} };
  }

  async execute(route: any, strategy: any): Promise<ExecutionResult> {
    const chainId = route.chainId;

    // Step 1: Decision gate
    const decision = await this.shouldExecute(route, strategy);
    if (!decision.approved) {
      this.logger.info(
        { routeId: route.id, reasons: decision.reasons },
        'Execution skipped'
      );
      return { status: 'skipped', reason: decision.reasons.join('; ') };
    }

    // Step 2: Acquire lock
    const lockKey = `fr:lock:execution:${strategy.id}:${chainId}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!lockAcquired) {
      return { status: 'skipped', reason: 'execution_lock_held' };
    }

    try {
      // Step 3: Reserve nonce
      const nonce = await this.nonceManager.reserveNonce(chainId);

      // Step 4: Build transaction
      const routeParams = this.buildRouteParams(route, strategy);
      const callData = encodeRouteParams(routeParams);
      const executorAddress = this.getExecutorAddress(chainId);

      const txRequest = {
        to: executorAddress,
        data: ethers.hexlify(callData),
        nonce,
        chainId,
        value: 0n,
        gasLimit: this.estimateGas(route),
        maxFeePerGas: await this.getMaxFeePerGas(provider),
        maxPriorityFeePerGas: await this.getMaxPriorityFeePerGas(provider),
      };

      // Step 5: Sign
      const signedTx = await this.wallet.signTransaction(txRequest);

      // Step 6: Submit
      const relay = this.relays.get(chainId)!;
      const currentBlock = await this.providers.get(chainId)!.getBlockNumber();
      const targets = [
        { blockNumber: currentBlock + 1 },
        { blockNumber: currentBlock + 2 },
      ];

      // Simulate first on Ethereum
      if (relay instanceof FlashbotsRelay) {
        const sim = await relay.simulate(signedTx, currentBlock + 1, ethers.ZeroAddress);
        if (!sim.success) {
          await this.nonceManager.releaseNonce(chainId, nonce);
          return { status: 'failed', reason: 'simulation_revert', error: sim.reason };
        }
      }

      // Submit to N+1 and N+2
      const bundleHashes = await relay.submitWithTargets(targets, signedTx);
      const primaryHash = bundleHashes.get(currentBlock + 1) ?? bundleHashes.get(currentBlock + 2)!;

      // Step 7: Create trade record
      const trade = await this.tradeService.createTrade({
        strategyId: strategy.id,
        chainId,
        status: 'submitted',
        routePath: route.path,
        flashLoanProvider: route.provider,
        flashLoanToken: route.token,
        flashLoanAmount: route.amount,
        simulatedProfitUsd: route.profitUsd,
      });

      // Step 8: Track inclusion
      const relayResult = relay instanceof FlashbotsRelay
        ? await relay.waitForInclusion(primaryHash, 3)
        : await relay.waitForInclusion(primaryHash, 25);

      // Step 9: Update trade with result
      if (relayResult.success) {
        await this.tradeService.updateTrade(trade.id, {
          status: 'included',
          txHash: relayResult.txHash,
          blockNumber: relayResult.blockNumber,
          gasUsed: relayResult.gasUsed?.toString(),
          gasPriceGwei: relayResult.gasPriceGwei,
        });
        return { tradeId: trade.id, txHash: relayResult.txHash, status: 'included' };
      } else {
        await this.tradeService.updateTrade(trade.id, {
          status: 'failed',
          errorMessage: relayResult.error ?? relayResult.reason,
        });
        return { tradeId: trade.id, status: 'failed', reason: relayResult.reason };
      }
    } catch (err) {
      this.logger.error({ err, routeId: route.id }, 'Execution error');
      return { status: 'failed', error: String(err) };
    } finally {
      // Step 10: Release lock
      await this.redis.del(lockKey);
    }
  }

  private buildRouteParams(route: any, strategy: any): RouteParamsStruct {
    const hops = route.hops.map((hop: any) => ({
      dexType: hop.dexType, // 1=V2, 2=V3, 3=Curve, 4=Balancer
      router: hop.router,
      tokenIn: hop.tokenIn,
      tokenOut: hop.tokenOut,
      amountIn: hop.amountIn ?? 0n, // 0 = use full previous output
      sqrtPriceLimitX96: hop.sqrtPriceLimitX96 ?? 0n,
    }));

    return {
      flashLoanProvider: route.provider === 'balancer' ? 1 : 2,
      flashLoanToken: route.token,
      flashLoanVault: route.vault,
      flashLoanAmount: route.amount,
      minProfit: route.minProfit ?? 0n,
      deadline: Math.floor(Date.now() / 1000) + 300,
      hops,
    };
  }

  private getExecutorAddress(chainId: number): string {
    // Deployed addresses from packages/contracts/script/
    const addresses: Record<number, string> = {
      1: 'TODO', // Deploy.s.sol output
      42161: 'TODO', // DeployArbitrum.s.sol output
    };
    return addresses[chainId] ?? 'TODO';
  }

  private estimateGas(route: any): bigint {
    const baseGas = 21_000n;
    const hopGas = 150_000n * BigInt(route.hops.length);
    const flashLoanGas = 40_000n;
    return baseGas + hopGas + flashLoanGas + 50_000n; // +50k buffer
  }

  private async getMaxFeePerGas(provider: ethers.JsonRpcProvider): Promise<bigint> {
    const feeData = await provider.getFeeData();
    return feeData.maxFeePerGas ?? 50_000_000_000n;
  }

  private async getMaxPriorityFeePerGas(provider: ethers.JsonRpcProvider): Promise<bigint> {
    const feeData = await provider.getFeeData();
    return feeData.maxPriorityFeePerGas ?? 2_000_000_000n;
  }
}
```

**Step 5: Run test and fix any issues**

```bash
cd apps/executor && pnpm test src/services/execution-engine.test.ts
# Fix compilation errors
```

**Step 6: Commit**

```bash
git add apps/executor/src/services/execution-engine.ts apps/executor/src/services/execution-engine.test.ts
git commit -m "feat(executor): add ExecutionEngine orchestrator — simulate → build → submit → track"
```

---

## Task 9: Redis Subscriber + Executor Worker Entry Point

**Files:**
- Create: `apps/executor/src/channels/redis-subscriber.ts`
- Create: `apps/executor/src/workers/executor.ts`
- Test: `apps/executor/src/workers/executor.test.ts`

**Step 1: Write worker test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ExecutorWorker', () => {
  let mockConfig: any;
  let mockRedis: any;
  let mockExecutionEngine: any;

  beforeEach(() => {
    mockConfig = { enabled: true, chains: [1] };
    mockRedis = {
      subscribe: vi.fn(),
      psubscribe: vi.fn(),
    };
    mockExecutionEngine = {
      execute: vi.fn(),
      shouldExecute: vi.fn().mockResolvedValue({ approved: true }),
    };
  });

  it('subscribes to fr:route:discovered on startup', async () => {
    const { ExecutorWorker } = await import('./executor');
    const worker = new ExecutorWorker(mockConfig, mockRedis, mockExecutionEngine);
    await worker.start();

    expect(mockRedis.subscribe).toHaveBeenCalledWith('fr:route:discovered');
  });

  it('logs and skips when EXECUTION_ENABLED=false', async () => {
    mockConfig.enabled = false;
    const { ExecutorWorker } = await import('./executor');
    const worker = new ExecutorWorker(mockConfig, mockRedis, mockExecutionEngine);

    const route = { id: 'route-1', chainId: 1, path: [], token: '0x...', amount: 1000n };
    await worker.handleRouteDiscovered(route);

    expect(mockExecutionEngine.execute).not.toHaveBeenCalled();
  });
});
```

**Step 2: Write Redis subscriber**

```typescript
// apps/executor/src/channels/redis-subscriber.ts

import { createRedisClients, type RedisClients } from '@flashroute/db';
import { Logger } from '@flashroute/shared';

export class RedisSubscriber {
  private readonly clients: RedisClients;
  private readonly logger: Logger;

  constructor() {
    this.clients = createRedisClients();
    this.logger = new Logger({ service: 'redis-subscriber' });
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    const subscriber = this.clients.subscriber;

    subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        try {
          handler(msg);
        } catch (err) {
          this.logger.error({ err, channel }, 'Error in channel handler');
        }
      }
    });

    await subscriber.subscribe(channel);
    this.logger.info({ channel }, 'Subscribed to Redis channel');
  }

  async psubscribe(pattern: string, handler: (channel: string, message: string) => void): Promise<void> {
    const subscriber = this.clients.subscriber;

    subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        handler(channel, message);
      } catch (err) {
        this.logger.error({ err, channel }, 'Error in pchannel handler');
      }
    });

    await subscriber.pSubscribe(pattern);
    this.logger.info({ pattern }, 'Subscribed to Redis pattern');
  }

  async close(): Promise<void> {
    await this.clients.subscriber.quit();
    await this.clients.publisher.quit();
    await this.clients.queue.quit();
    await this.clients.cache.quit();
  }
}
```

**Step 3: Write executor worker**

```typescript
// apps/executor/src/workers/executor.ts

import { RedisSubscriber } from '../channels/redis-subscriber';
import { NonceManager } from '../modules/execution/nonce-manager';
import { TxTracker } from '../modules/execution/tx-tracker';
import { ExecutionEngine } from '../services/execution-engine';
import { loadExecutionConfig, type ExecutionConfig } from '../config/execution.config';
import { createRedisClients } from '@flashroute/db';
import { Logger } from '@flashroute/shared';
import { REDIS_CHANNELS } from '@flashroute/shared';
import { checkRedisHealth } from '@flashroute/db';

export class ExecutorWorker {
  private readonly config: ExecutionConfig;
  private readonly redisSubscriber: RedisSubscriber;
  private readonly executionEngine: ExecutionEngine;
  private readonly logger: Logger;

  constructor(
    config: ExecutionConfig,
    redisClients: ReturnType<typeof createRedisClients>,
    executionEngine: ExecutionEngine
  ) {
    this.config = config;
    this.redisSubscriber = new RedisSubscriber();
    this.executionEngine = executionEngine;
    this.logger = new Logger({ service: 'executor-worker' });
  }

  async start(): Promise<void> {
    this.logger.info({ enabled: this.config.enabled }, 'Starting executor worker');

    // Health check
    const redisHealthy = await checkRedisHealth();
    if (!redisHealthy) {
      throw new Error('Redis health check failed');
    }

    // Subscribe to route discoveries
    await this.redisSubscriber.subscribe(
      REDIS_CHANNELS.routeDiscovered,
      this.handleRouteDiscovered.bind(this)
    );

    this.logger.info('Executor worker started');
  }

  async handleRouteDiscovered(message: string): Promise<void> {
    let route: any;
    try {
      route = JSON.parse(message);
    } catch {
      this.logger.warn({ message }, 'Failed to parse route discovery message');
      return;
    }

    this.logger.debug(
      { routeId: route.id, chainId: route.chainId },
      'Route discovered'
    );

    if (!this.config.enabled) {
      this.logger.info(
        { routeId: route.id },
        '[SIMULATED] Would execute route (EXECUTION_ENABLED=false)'
      );
      return;
    }

    const strategy = await this.findMatchingStrategy(route);
    if (!strategy) {
      this.logger.debug({ routeId: route.id }, 'No matching strategy');
      return;
    }

    try {
      const result = await this.executionEngine.execute(route, strategy);
      this.logger.info(
        { routeId: route.id, status: result.status, reason: result.reason },
        'Execution complete'
      );
    } catch (err) {
      this.logger.error({ err, routeId: route.id }, 'Execution failed');
    }
  }

  private async findMatchingStrategy(route: any): Promise<any | null> {
    // TODO: Query strategy service / database for matching strategy
    // For now, return a mock strategy for testing
    return {
      id: 'strategy-default',
      chainId: route.chainId,
      tokens: [route.token],
      minProfitUsd: 10,
      maxGasPriceGwei: 100,
    };
  }

  async stop(): Promise<void> {
    await this.redisSubscriber.close();
    this.logger.info('Executor worker stopped');
  }
}
```

**Step 4: Run tests and fix issues**

```bash
cd apps/executor && pnpm test src/workers/executor.test.ts
# Fix compilation errors
```

**Step 5: Commit**

```bash
git add apps/executor/src/channels/redis-subscriber.ts apps/executor/src/workers/executor.ts apps/executor/src/workers/executor.test.ts
git commit -m "feat(executor): add RedisSubscriber and ExecutorWorker entry point"
```

---

## Task 10: Integration with TradeService

The TradeService in `apps/api/src/modules/trades/trades.service.ts` handles trade records. The executor needs to call it. Options:

1. **Direct database access** — executor imports `TradeService` or uses Prisma directly
2. **Redis queue** — executor publishes to `fr:trades:queue`, TradeService consumes and creates records
3. **gRPC / API call** — executor calls apps/api REST endpoint

**Recommended**: Redis queue. The `REDIS_CHANNELS.tradesQueue` already exists. Executor publishes trade creation/update messages to this queue. TradeService (in apps/api) consumes and handles database writes.

**Implementation**: Create a `TradeQueuePublisher` in `apps/executor` that publishes structured messages to `fr:trades:queue`. No direct dependency on apps/api.

**Step 1: Create TradeQueuePublisher**

```typescript
// apps/executor/src/channels/trade-queue-publisher.ts

import { createRedisClients } from '@flashroute/db';
import { Logger } from '@flashroute/shared';
import { REDIS_CHANNELS } from '@flashroute/shared';

export interface TradeCreateMessage {
  type: 'create' | 'update';
  tradeId?: string;
  payload: Record<string, any>;
}

export class TradeQueuePublisher {
  private readonly publisher: ReturnType<typeof createRedisClients>['publisher'];
  private readonly logger: Logger;

  constructor() {
    const clients = createRedisClients();
    this.publisher = clients.publisher;
    this.logger = new Logger({ service: 'trade-queue-publisher' });
  }

  async publishCreateTrade(payload: Record<string, any>): Promise<string> {
    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message: TradeCreateMessage = {
      type: 'create',
      tradeId,
      payload,
    };
    await this.publisher.lpush(REDIS_CHANNELS.tradesQueue, JSON.stringify(message));
    this.logger.debug({ tradeId }, 'Published trade create message');
    return tradeId;
  }

  async publishUpdateTrade(tradeId: string, payload: Record<string, any>): Promise<void> {
    const message: TradeCreateMessage = {
      type: 'update',
      tradeId,
      payload,
    };
    await this.publisher.lpush(REDIS_CHANNELS.tradesQueue, JSON.stringify(message));
    this.logger.debug({ tradeId }, 'Published trade update message');
  }

  async close(): Promise<void> {
    const clients = createRedisClients();
    await clients.publisher.quit();
  }
}
```

**Step 2: Commit**

```bash
git add apps/executor/src/channels/trade-queue-publisher.ts
git commit -m "feat(executor): add TradeQueuePublisher for trade record management"
```

---

## Task 11: Full Integration Test + All 15 Tests

**Files:**
- Create: `apps/executor/src/services/execution-engine.integration.test.ts`

Write tests covering:
1. Profit simulation still works (existing profit simulator still valid)
2. RouteParams encoding/decoding roundtrip
3. NonceManager atomic increment
4. FlashbotsRelay.simulate() called before submission
5. N+1 and N+2 targets submitted
6. TxTracker waits for receipt and resolves correctly
7. Trade record created on submission
8. Execution lock prevents duplicate execution
9. EXECUTION_ENABLED=false logs without executing
10. Stale simulation (>6s) is rejected
11. Nonce released on submission failure
12. Auto-pause triggers after 5 consecutive reverts (mock failure count)

```bash
cd apps/executor && pnpm test src/services/execution-engine.integration.test.ts
# Fix any failures
```

**Commit:**

```bash
git add apps/executor/src/services/execution-engine.integration.test.ts
git commit -m "test(executor): add integration tests covering execution flow"
```

---

## Task 12: Update package.json Scripts

**Files:**
- Modify: `apps/executor/package.json`

```json
{
  "scripts": {
    "dev": "tsx src/workers/executor.ts",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src --ext .ts"
  }
}
```

**Commit:**

```bash
git add apps/executor/package.json
git commit -m "chore(executor): add dev and build scripts"
```

---

## Reference Files

- Design: `docs/plans/2026-03-28-F2-execution-engine-design.md`
- Spec: `09-BACKEND-CORE-3.md` (lines 96-428)
- Contract: `packages/contracts/src/FlashRouteExecutor.sol`
- Types: `packages/contracts/src/types/Types.sol`
- Redis channels: `packages/shared/src/constants.ts` (`REDIS_CHANNELS`)
- Logger: `packages/shared/src/logger.ts`
- ProfitSimulator: `apps/executor/src/modules/simulation/profit-simulator.ts`

---

**Plan complete.** Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
