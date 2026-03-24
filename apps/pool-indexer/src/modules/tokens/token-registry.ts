import type { PoolTokenInput } from '../pools/pool-types';

export interface RegisteredToken extends Omit<PoolTokenInput, 'rawBalance'> {}

export class TokenRegistry {
  private readonly tokens = new Map<string, RegisteredToken>();

  registerTokens(chainId: number, tokens: PoolTokenInput[]): void {
    for (const token of tokens) {
      this.tokens.set(this.getKey(chainId, token.address), {
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
      });
    }
  }

  getToken(chainId: number, address: string): RegisteredToken | null {
    return this.tokens.get(this.getKey(chainId, address)) ?? null;
  }

  private getKey(chainId: number, address: string): string {
    return `${chainId}:${address.toLowerCase()}`;
  }
}
