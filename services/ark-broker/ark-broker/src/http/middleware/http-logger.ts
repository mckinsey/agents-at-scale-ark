import {pinoHttp} from 'pino-http';
import type {RequestHandler} from 'express';
import type {Logger} from '@ark-broker/logging/logger.js';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as {id?: string}).id ?? '',
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }) as unknown as RequestHandler;
}
