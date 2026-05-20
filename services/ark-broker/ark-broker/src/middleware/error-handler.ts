import type {ErrorRequestHandler, RequestHandler} from 'express';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    stack?: string;
  };
};

export function createErrorHandler(deps: {
  includeStack: boolean;
}): ErrorRequestHandler {
  return (err, req, res, _next) => {
    req.log.error({err}, 'unhandled error');

    const status: number =
      (err as {status?: number}).status ??
      (err as {statusCode?: number}).statusCode ??
      500;

    const body: ErrorBody = {
      error: {
        code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: status === 500 ? 'Internal server error' : String(err.message),
        requestId: req.id === undefined ? undefined : String(req.id),
      },
    };

    if (deps.includeStack && err instanceof Error && err.stack) {
      body.error.stack = err.stack;
    }

    res.status(status).json(body);
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Not found',
      requestId: req.id === undefined ? undefined : String(req.id),
    },
  });
};
