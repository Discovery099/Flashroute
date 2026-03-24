import { describe, expect, it } from 'vitest';

import { buildStrategyFactoryInput } from './strategy.factory';
import { buildTradeFactoryInput } from './trade.factory';
import { buildUserFactoryInput } from './user.factory';

describe('db factories', () => {
  it('builds a standalone user insert input', () => {
    const input = buildUserFactoryInput();

    expect(input.email).toMatch(/@flashroute\.test$/);
    expect(input.name).toBe('FlashRoute User');
    expect(input.id).toBeUndefined();
    expect(input.createdAt).toBeUndefined();
    expect(input.updatedAt).toBeUndefined();
  });

  it('builds a strategy insert input from explicit relation ids', () => {
    const input = buildStrategyFactoryInput({
      userId: 'user-id',
      chainId: 1,
    });

    expect(input.userId).toBe('user-id');
    expect(input.chainId).toBe(1);
    expect(input.id).toBeUndefined();
    expect(input.createdAt).toBeUndefined();
    expect(input.updatedAt).toBeUndefined();
  });

  it('builds a trade insert input from explicit relation ids', () => {
    const input = buildTradeFactoryInput({
      strategyId: 'strategy-id',
      userId: 'user-id',
      chainId: 1,
    });

    expect(input.strategyId).toBe('strategy-id');
    expect(input.userId).toBe('user-id');
    expect(input.chainId).toBe(1);
    expect(input.id).toBeUndefined();
    expect(input.createdAt).toBeUndefined();
  });
});
