import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, withRequestContext } from './logger';

describe('logger foundation', () => {
  it('writes structured json logs with service metadata', async () => {
    const destination = new PassThrough();
    const chunks: string[] = [];
    destination.on('data', (chunk) => chunks.push(String(chunk)));

    const logger = createLogger('api-server', { destination, level: 'info' });
    logger.info({ feature: 'health' }, 'ready');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entry = JSON.parse(chunks[0].trim()) as Record<string, unknown>;
    expect(entry.service).toBe('api-server');
    expect(entry.level).toBe(30);
    expect(entry.feature).toBe('health');
    expect(entry.msg).toBe('ready');
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  it('binds request and correlation ids through child loggers', async () => {
    const destination = new PassThrough();
    const chunks: string[] = [];
    destination.on('data', (chunk) => chunks.push(String(chunk)));

    const logger = withRequestContext(
      createLogger('executor', { destination, level: 'info' }),
      { requestId: 'req-123', correlationId: 'corr-789' },
    );
    logger.info('bundle submitted');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entry = JSON.parse(chunks[0].trim()) as Record<string, unknown>;
    expect(entry.requestId).toBe('req-123');
    expect(entry.correlationId).toBe('corr-789');
  });
});
