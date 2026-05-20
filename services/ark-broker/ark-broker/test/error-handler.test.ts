import express from 'express';
import {Writable} from 'node:stream';
import request from 'supertest';
import {createLogger} from '../src/logging/logger.js';
import {
  createErrorHandler,
  notFoundHandler,
} from '../src/middleware/error-handler.js';
import {createHttpLogger} from '../src/middleware/http-logger.js';
import {requestId} from '../src/middleware/request-id.js';

class MemorySink extends Writable {
  public readonly lines: string[] = [];

  _write(chunk: Buffer, _enc: string, cb: (err?: Error) => void): void {
    this.lines.push(chunk.toString().trim());
    cb();
  }
}

function makeApp(opts: {includeStack: boolean}): {
  app: express.Express;
  sink: MemorySink;
} {
  const sink = new MemorySink();
  const logger = createLogger({level: 'info', pretty: false}, sink);
  const app = express();
  app.use(requestId);
  app.use(createHttpLogger(logger));
  app.get('/__test-throw', (_req, _res, next) => {
    next(new Error('boom from test route'));
  });
  app.use(createErrorHandler({includeStack: opts.includeStack}));
  app.use(notFoundHandler);
  return {app, sink};
}

describe('error handler middleware', () => {
  test('responds with structured shape and echoes the request id', async () => {
    const {app} = makeApp({includeStack: false});

    const res = await request(app)
      .get('/__test-throw')
      .set('X-Request-ID', 'err-test-1');

    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('err-test-1');
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: 'err-test-1',
      },
    });
  });

  test('logs the error with the request id binding', async () => {
    const {app, sink} = makeApp({includeStack: false});

    await request(app).get('/__test-throw').set('X-Request-ID', 'err-test-2');

    const errorLine = sink.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find(
        (entry) =>
          entry.level === 'error' &&
          (entry.req as {id?: string} | undefined)?.id === 'err-test-2'
      );

    expect(errorLine).toBeDefined();
    expect(errorLine?.err).toBeDefined();
  });

  test('omits stack when includeStack is false', async () => {
    const {app} = makeApp({includeStack: false});

    const res = await request(app).get('/__test-throw');

    expect(res.body.error.stack).toBeUndefined();
  });

  test('includes stack when includeStack is true', async () => {
    const {app} = makeApp({includeStack: true});

    const res = await request(app).get('/__test-throw');

    expect(res.body.error.stack).toBeDefined();
    expect(res.body.error.stack).toContain('boom from test route');
  });

  test('404 responses share the same shape', async () => {
    const {app} = makeApp({includeStack: false});

    const res = await request(app)
      .get('/does-not-exist')
      .set('X-Request-ID', '404-test');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
        requestId: '404-test',
      },
    });
  });
});
