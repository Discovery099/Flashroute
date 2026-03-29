import { describe, it, expect } from 'vitest';
import { encodeRouteParams, decodeRouteParams } from './transaction-builder';

describe('TransactionBuilder', () => {
  it('encodes RouteParams to bytes', () => {
    const params = {
      flashLoanProvider: 1 as const,
      flashLoanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      flashLoanVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      flashLoanAmount: 1_000_000_000n,
      minProfit: 10_000_000n,
      deadline: Math.floor(Date.now() / 1000) + 300,
      hops: [
        {
          dexType: 1 as const,
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

  it('roundtrips encode and decode', () => {
    const params = {
      flashLoanProvider: 2 as const,
      flashLoanToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      flashLoanVault: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      flashLoanAmount: 10n ** 18n,
      minProfit: 0n,
      deadline: 9999999999,
      hops: [
        {
          dexType: 2 as const,
          router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
          tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          amountIn: 1n,
          sqrtPriceLimitX96: 4295128740n,
        },
      ],
    };

    const encoded = encodeRouteParams(params);
    const decoded = decodeRouteParams(encoded);

    expect(decoded.flashLoanProvider).toBe(2);
    expect(decoded.flashLoanAmount).toBe(10n ** 18n);
    expect(decoded.hops[0].dexType).toBe(2);
    expect(decoded.hops[0].sqrtPriceLimitX96).toBe(4295128740n);
    expect(decoded.hops[0].tokenOut).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
  });

  it('handles multiple hops', () => {
    const params = {
      flashLoanProvider: 1 as const,
      flashLoanToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      flashLoanVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      flashLoanAmount: 1_000_000_000n,
      minProfit: 0n,
      deadline: 9999999999,
      hops: [
        { dexType: 1, router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', amountIn: 1_000_000_000n, sqrtPriceLimitX96: 0n },
        { dexType: 2, router: '0xE592427A0AEce92De3Edee1F18E0157C05861564', tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', tokenOut: '0xdAC17F958D2ee523a2206206994597C13D831ec7', amountIn: 0n, sqrtPriceLimitX96: 0n },
      ],
    };

    const encoded = encodeRouteParams(params);
    const decoded = decodeRouteParams(encoded);

    expect(decoded.hops.length).toBe(2);
    expect(decoded.hops[0].dexType).toBe(1);
    expect(decoded.hops[1].dexType).toBe(2);
    expect(decoded.hops[1].amountIn).toBe(0n);
  });
});
