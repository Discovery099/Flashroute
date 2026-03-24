export type HealthStatus = 'healthy' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  details: Record<string, unknown>;
}

export const runHealthCheck = async (
  name: string,
  probe: () => Promise<Record<string, unknown>>,
): Promise<HealthCheckResult> => {
  const startedAt = Date.now();

  try {
    const details = await probe();

    return {
      name,
      status: 'healthy',
      details: {
        ...details,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      details: {
        message: error instanceof Error ? error.message : 'Unknown health check failure',
      },
    };
  }
};
