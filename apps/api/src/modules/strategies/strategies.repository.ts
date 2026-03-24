export interface StrategyRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  chainId: number;
  isActive: boolean;
  minProfitUsd: number;
  maxTradeSizeUsd: number;
  maxHops: number;
  maxSlippageBps: number;
  cooldownSeconds: number;
  allowedDexes: string[];
  flashLoanProvider: string;
  useFlashbots: boolean;
  maxGasPriceGwei: number;
  riskBufferPct: number;
  useDemandPrediction: boolean;
  executionCount: number;
  totalProfitUsd: number;
  createdAt: Date;
  updatedAt: Date;
  chain: { chainId: number; name: string; executorContractAddress: string | null } | null;
}

export interface StrategyListFilters {
  chainId?: number;
  status: 'all' | 'active' | 'paused' | 'draft';
  search?: string;
  page: number;
  limit: number;
}

export interface CreateStrategyRecordInput {
  userId: string;
  name: string;
  description?: string;
  chainId: number;
  minProfitUsd?: number;
  maxTradeSizeUsd?: number;
  maxHops?: number;
  maxSlippageBps?: number;
  cooldownSeconds?: number;
  allowedDexes?: string[];
  flashLoanProvider?: string;
  useFlashbots?: boolean;
  maxGasPriceGwei?: number;
  riskBufferPct?: number;
  useDemandPrediction?: boolean;
}

export interface UpdateStrategyRecordInput extends Partial<CreateStrategyRecordInput> {
  isActive?: boolean;
}

export interface StrategiesRepository {
  countByUser(userId: string): Promise<number>;
  create(input: CreateStrategyRecordInput): Promise<StrategyRecord>;
  listByUser(userId: string, filters: StrategyListFilters): Promise<{ strategies: StrategyRecord[]; total: number }>;
  findById(userId: string, strategyId: string): Promise<StrategyRecord | null>;
  update(strategyId: string, updates: UpdateStrategyRecordInput): Promise<StrategyRecord>;
  delete(strategyId: string): Promise<void>;
  getChain(chainId: number): Promise<{ chainId: number; name: string; executorContractAddress: string | null; isActive: boolean } | null>;
}

export interface PrismaStrategyModel {
  count(args: { where: unknown }): Promise<number>;
  create(args: { data: unknown; include?: unknown }): Promise<unknown>;
  findFirst(args: { where: unknown; include?: unknown }): Promise<unknown | null>;
  findMany(args: { where: unknown; include?: unknown; orderBy?: unknown; skip?: number; take?: number }): Promise<unknown[]>;
  update(args: { where: { id: string }; data: unknown; include?: unknown }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

export interface PrismaSupportedChainModel {
  findUnique(args: { where: { chainId: number } }): Promise<unknown | null>;
}

export interface PrismaStrategiesClientLike {
  strategy: PrismaStrategyModel;
  supportedChain: PrismaSupportedChainModel;
}

const decimalToNumber = (value: number | { toString(): string } | null | undefined) => Number(value ?? 0);

const toStrategyRecord = (record: any): StrategyRecord => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  description: record.description ?? '',
  chainId: record.chainId,
  isActive: record.isActive,
  minProfitUsd: decimalToNumber(record.minProfitUsd),
  maxTradeSizeUsd: decimalToNumber(record.maxTradeSizeUsd),
  maxHops: record.maxHops,
  maxSlippageBps: Number(record.maxSlippageBps ?? 100),
  cooldownSeconds: Number(record.cooldownSeconds ?? 0),
  allowedDexes: Array.isArray(record.allowedDexes) ? record.allowedDexes : [],
  flashLoanProvider: String(record.flashLoanProvider).toLowerCase(),
  useFlashbots: record.useFlashbots,
  maxGasPriceGwei: decimalToNumber(record.maxGasPriceGwei),
  riskBufferPct: decimalToNumber(record.riskBufferPct),
  useDemandPrediction: record.useDemandPrediction,
  executionCount: record.executionCount,
  totalProfitUsd: decimalToNumber(record.totalProfitUsd),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  chain: record.chain
    ? {
        chainId: record.chain.chainId,
        name: record.chain.name,
        executorContractAddress: record.chain.executorContractAddress ?? null,
      }
    : null,
});

const flashLoanProviderMap: Record<string, string> = {
  auto: 'AUTO',
  aave: 'AAVE',
  balancer: 'BALANCER',
  dydx: 'DYDX',
};

export class PrismaStrategiesRepository implements StrategiesRepository {
  public constructor(private readonly prisma: PrismaStrategiesClientLike) {}

  public countByUser(userId: string) {
    return this.prisma.strategy.count({ where: { userId } });
  }

  public async create(input: CreateStrategyRecordInput) {
    return toStrategyRecord(
      await this.prisma.strategy.create({
        data: {
          userId: input.userId,
          name: input.name,
          description: input.description ?? '',
          chainId: input.chainId,
          minProfitUsd: input.minProfitUsd ?? 10,
          maxTradeSizeUsd: input.maxTradeSizeUsd ?? 100000,
          maxHops: input.maxHops ?? 4,
          maxSlippageBps: input.maxSlippageBps ?? 100,
          cooldownSeconds: input.cooldownSeconds ?? 0,
          allowedDexes: input.allowedDexes ?? undefined,
          flashLoanProvider: flashLoanProviderMap[input.flashLoanProvider ?? 'auto'],
          useFlashbots: input.useFlashbots ?? true,
          maxGasPriceGwei: input.maxGasPriceGwei ?? 100,
          riskBufferPct: input.riskBufferPct ?? 0.5,
          useDemandPrediction: input.useDemandPrediction ?? true,
        },
        include: { chain: true },
      }),
    );
  }

  public async listByUser(userId: string, filters: StrategyListFilters) {
    const where = {
      userId,
      ...(filters.chainId === undefined ? {} : { chainId: filters.chainId }),
      ...(filters.status === 'all' ? {} : { isActive: filters.status === 'active' }),
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' as const } } : {}),
    };
    const [total, strategies] = await Promise.all([
      this.prisma.strategy.count({ where }),
      this.prisma.strategy.findMany({
        where,
        include: { chain: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
    ]);
    return { strategies: strategies.map(toStrategyRecord), total };
  }

  public async findById(userId: string, strategyId: string) {
    const record = await this.prisma.strategy.findFirst({ where: { id: strategyId, userId }, include: { chain: true } });
    return record ? toStrategyRecord(record) : null;
  }

  public async update(strategyId: string, updates: UpdateStrategyRecordInput) {
    return toStrategyRecord(
      await this.prisma.strategy.update({
        where: { id: strategyId },
        data: {
          ...(updates.name === undefined ? {} : { name: updates.name }),
          ...(updates.description === undefined ? {} : { description: updates.description }),
          ...(updates.minProfitUsd === undefined ? {} : { minProfitUsd: updates.minProfitUsd }),
          ...(updates.maxTradeSizeUsd === undefined ? {} : { maxTradeSizeUsd: updates.maxTradeSizeUsd }),
          ...(updates.maxHops === undefined ? {} : { maxHops: updates.maxHops }),
          ...(updates.maxSlippageBps === undefined ? {} : { maxSlippageBps: updates.maxSlippageBps }),
          ...(updates.cooldownSeconds === undefined ? {} : { cooldownSeconds: updates.cooldownSeconds }),
          ...(updates.allowedDexes === undefined ? {} : { allowedDexes: updates.allowedDexes }),
          ...(updates.flashLoanProvider === undefined ? {} : { flashLoanProvider: flashLoanProviderMap[updates.flashLoanProvider] }),
          ...(updates.useFlashbots === undefined ? {} : { useFlashbots: updates.useFlashbots }),
          ...(updates.maxGasPriceGwei === undefined ? {} : { maxGasPriceGwei: updates.maxGasPriceGwei }),
          ...(updates.riskBufferPct === undefined ? {} : { riskBufferPct: updates.riskBufferPct }),
          ...(updates.useDemandPrediction === undefined ? {} : { useDemandPrediction: updates.useDemandPrediction }),
          ...(updates.isActive === undefined ? {} : { isActive: updates.isActive }),
        },
        include: { chain: true },
      }),
    );
  }

  public async delete(strategyId: string) {
    await this.prisma.strategy.delete({ where: { id: strategyId } });
  }

  public async getChain(chainId: number) {
    const record = await this.prisma.supportedChain.findUnique({ where: { chainId } });
    if (!record) {
      return null;
    }
    return {
      chainId: (record as any).chainId,
      name: (record as any).name,
      executorContractAddress: (record as any).executorContractAddress ?? null,
      isActive: (record as any).isActive,
    };
  }
}
