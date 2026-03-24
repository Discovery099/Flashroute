import { describe, expect, it } from 'vitest';

import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BlockchainError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

describe('AppError hierarchy', () => {
  it('preserves status code code and details', () => {
    const error = new ValidationError('Invalid payload', [{ field: 'email' }]);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      name: 'ValidationError',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'email' }],
      isOperational: true,
    });
  });

  it('maps the foundation error types to expected statuses', () => {
    expect(new NotFoundError('missing').statusCode).toBe(404);
    expect(new AuthenticationError('nope').statusCode).toBe(401);
    expect(new AuthorizationError('denied').statusCode).toBe(403);
    expect(new RateLimitError('slow down', { retryAfter: 30 }).statusCode).toBe(429);
    expect(new BlockchainError('rpc down').statusCode).toBe(502);
    expect(new ExternalServiceError('stripe down').statusCode).toBe(503);
  });
});
