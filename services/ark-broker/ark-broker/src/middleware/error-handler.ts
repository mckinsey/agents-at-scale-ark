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

    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: req.id === undefined ? undefined : String(req.id),
      },
    };

    if (deps.includeStack && err instanceof Error && err.stack) {
      body.error.stack = err.stack;
    }

    res.status(500).json(body);
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
