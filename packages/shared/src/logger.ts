import pino, { type DestinationStream, type Logger, type LoggerOptions, type LevelWithSilent } from 'pino';

export interface LoggerContext {
  requestId?: string;
  correlationId?: string;
}

export interface CreateLoggerOptions {
  destination?: DestinationStream;
  level?: LevelWithSilent;
}

const redactPaths = ['password', 'passwordHash', 'token', 'refreshToken', 'privateKey', 'secret', 'apiKey'];

export const createLogger = (service: string, options: CreateLoggerOptions = {}): Logger => {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? 'info',
    base: { service },
    redact: redactPaths,
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  };

  return options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions);
};

export const withRequestContext = (logger: Logger, context: LoggerContext): Logger => logger.child(context);
