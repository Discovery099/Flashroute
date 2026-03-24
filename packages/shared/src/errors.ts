export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  public constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  public constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  public constructor(message = 'Authentication failed', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends AppError {
  public constructor(message = 'Forbidden', details?: unknown) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

export class RateLimitError extends AppError {
  public constructor(message = 'Rate limit exceeded', details?: unknown) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
  }
}

export class BlockchainError extends AppError {
  public constructor(message = 'Blockchain operation failed', details?: unknown) {
    super(message, 502, 'BLOCKCHAIN_ERROR', details);
  }
}

export class ExternalServiceError extends AppError {
  public constructor(message = 'External service request failed', details?: unknown) {
    super(message, 503, 'EXTERNAL_SERVICE_ERROR', details);
  }
}
