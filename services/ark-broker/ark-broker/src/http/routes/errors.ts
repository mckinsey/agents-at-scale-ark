import type {Response} from 'express';
import type {ZodError} from 'zod';
import {PaginationError} from '@ark-broker/brokers/pagination.js';

export function sendValidationError(
  res: Response,
  error: ZodError,
  reqId: unknown,
  pathFallback = 'body'
): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: error.issues
        .map((e) => `${e.path.join('.') || pathFallback}: ${e.message}`)
        .join('; '),
      requestId: reqId === undefined ? undefined : String(reqId),
    },
  });
}

export function sendPaginationError(
  res: Response,
  error: PaginationError,
  reqId: unknown
): void {
  res.status(400).json({
    error: {
      code: 'PAGINATION_ERROR',
      message: error.message,
      requestId: reqId === undefined ? undefined : String(reqId),
    },
  });
}

export function sendInternalError(res: Response, reqId: unknown): void {
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: reqId === undefined ? undefined : String(reqId),
    },
  });
}

export function sendMissingQueryIdError(res: Response, reqId: unknown): void {
  res.status(400).json({
    error: {
      code: 'BAD_REQUEST',
      message: 'Query ID is required',
      requestId: reqId === undefined ? undefined : String(reqId),
    },
  });
}
