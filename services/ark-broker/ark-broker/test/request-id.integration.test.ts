import {Writable} from 'node:stream';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';

class MemorySink extends Writable {
  public readonly lines: string[] = [];

  _write(chunk: Buffer, _enc: string, cb: (err?: Error) => void): void {
    this.lines.push(chunk.toString().trim());
    cb();
  }
}

describe('request-id middleware', () => {
  test('echoes the incoming X-Request-ID header', async () => {
    const config = loadConfig({});
    const logger = createLogger({level: 'silent', pretty: false});
    const {app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
    });

    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', 'my-test-id-123');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('my-test-id-123');
  });

  test('generates a fresh X-Request-ID when none is provided', async () => {
    const config = loadConfig({});
    const logger = createLogger({level: 'silent', pretty: false});
    const {app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test('the per-request child logger carries the request id', async () => {
    const config = loadConfig({});
    const sink = new MemorySink();
    const logger = createLogger({level: 'info', pretty: false}, sink);
    const {app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
    });

    await request(app).get('/health').set('X-Request-ID', 'log-correlation-1');

    const requestLine = sink.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => {
        const req = entry.req as {id?: string} | undefined;
        return req?.id === 'log-correlation-1';
      });

    expect(requestLine).toBeDefined();
  });
});
