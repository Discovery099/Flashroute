import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

describe('loadExecutionConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('parses EXECUTION_ENABLED=true', async () => {
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = '0x' + 'a'.repeat(64);
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses EXECUTION_ENABLED=false', async () => {
    process.env.EXECUTION_ENABLED = 'false';
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.enabled).toBe(false);
  });

  it('throws if EXECUTOR_PRIVATE_KEY missing when enabled', async () => {
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = '';
    const { loadExecutionConfig } = await import('./execution.config');
    expect(() => loadExecutionConfig()).toThrow('EXECUTOR_PRIVATE_KEY');
  });

  it('has sensible defaults for optional fields', async () => {
    process.env.EXECUTION_ENABLED = 'true';
    process.env.EXECUTOR_PRIVATE_KEY = '0x' + 'a'.repeat(64);
    const { loadExecutionConfig } = await import('./execution.config');
    const config = loadExecutionConfig();
    expect(config.stalenessThresholdMs).toBe(6000);
    expect(config.gasReserveEth).toBe(0.05);
    expect(config.maxPendingPerChain).toBe(1);
    expect(config.chains).toEqual([1, 42161]);
  });

  it('allows EXECUTION_ENABLED=false without private key', async () => {
    process.env.EXECUTION_ENABLED = 'false';
    process.env.EXECUTOR_PRIVATE_KEY = '';
    const { loadExecutionConfig } = await import('./execution.config');
    expect(() => loadExecutionConfig()).not.toThrow();
  });
});
