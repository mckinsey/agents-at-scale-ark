import type {Response} from 'express';
import type {ZodError} from 'zod';

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
