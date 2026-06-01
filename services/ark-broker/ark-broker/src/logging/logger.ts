import pino, {
  stdSerializers,
  stdTimeFunctions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';
import type {LogLevel} from '@ark-broker/config/index.js';

export type LoggerConfig = {
  level: LogLevel;
  pretty: boolean;
};

const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-csrf-token"]',
  'req.headers["proxy-authorization"]',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
];

export function createLogger(
  config: LoggerConfig,
  destination?: DestinationStream
): Logger {
  const options: LoggerOptions = {
    level: config.level,
    timestamp: stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({level: label}),
    },
    serializers: {
      err: stdSerializers.err,
      req: stdSerializers.req,
      res: stdSerializers.res,
    },
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[REDACTED]',
    },
  };

  if (destination) {
    return pino(options, destination);
  }
  if (config.pretty) {
    options.transport = {target: 'pino-pretty'};
  }
  return pino(options);
}

export type {Logger} from 'pino';
