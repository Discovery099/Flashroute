import type { RawPoolState } from '../pools/pool-types';

export interface GetPoolsOptions {
  fromBlock?: number;
  fullResync: boolean;
}

export interface PoolSnapshotBatch {
  snapshotBlock: number;
  pools: RawPoolState[];
}

export interface ChainAdapter {
  getPools(options: GetPoolsOptions): Promise<PoolSnapshotBatch>;
  getReserves(pool: RawPoolState): Promise<RawPoolState | null>;
  getBlockNumber(): Promise<number>;
}

export interface ChainRegistration {
  chainId: number;
  adapter: ChainAdapter;
}

export class ChainManager {
  private readonly adapters = new Map<number, ChainAdapter>();

  registerChain({ chainId, adapter }: ChainRegistration): void {
    this.adapters.set(chainId, adapter);
  }

  getAdapter(chainId: number): ChainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new Error(`Missing chain adapter for chain ${chainId}`);
    }

    return adapter;
  }
}

export class MockChainAdapter implements ChainAdapter {
  public readonly calls: {
    getPools: GetPoolsOptions[];
    getReserves: string[];
  } = {
    getPools: [],
    getReserves: [],
  };

  constructor(
    private readonly options: {
      latestBlockNumber: number;
      snapshotBlock?: number;
      pools: RawPoolState[];
    },
  ) {}

  async getPools(options: GetPoolsOptions): Promise<PoolSnapshotBatch> {
    this.calls.getPools.push(options);
    return {
      snapshotBlock: this.options.snapshotBlock ?? this.options.latestBlockNumber,
      pools: this.options.pools,
    };
  }

  async getReserves(pool: RawPoolState): Promise<RawPoolState | null> {
    this.calls.getReserves.push(pool.poolAddress);
    return pool;
  }

  async getBlockNumber(): Promise<number> {
    return this.options.latestBlockNumber;
  }
}
