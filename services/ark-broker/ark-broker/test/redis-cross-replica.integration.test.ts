import type {Express} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createRedis} from '../src/redis/redis.js';
import {useRedisContainer} from '../src/redis/__tests__/testHelpers/redis-testcontainer.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

const textChunk = JSON.stringify({choices: [{delta: {content: 'hello'}}]});
const finishChunk = JSON.stringify({choices: [{finish_reason: 'stop'}]});
const ndjson = (...lines: string[]): string => lines.join('\n') + '\n';

function consumeSSE(
  app: Express,
  path: string,
  timeoutMs = 8000
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const events: string[] = [];
    const timer = setTimeout(() => {
      resolve(events);
      req.abort();
    }, timeoutMs);

    const req = request(app)
      .get(path)
      .buffer(false)
      .parse((res, _cb) => {
        let buf = '';
        res.on('data', (raw: Buffer) => {
          buf += raw.toString();
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          lines.forEach((line) => {
            if (line.startsWith('data: ')) events.push(line.slice(6));
          });
        });
        res.on('end', () => {
          clearTimeout(timer);
          resolve(events);
        });
      })
      .end((err) => {
        if (err && err !== 'aborted') {
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

describeIntegration('redis chunk backend — cross-replica', () => {
  const {connectionUrl} = useRedisContainer();
  let appA: Express;
  let appB: Express;

  beforeAll(() => {
    const url = connectionUrl();
    const config = loadConfig({CHUNK_BACKEND: 'redis', REDIS_URL: url});

    const redisA = createRedis(config, logger);
    const redisB = createRedis(config, logger);

    appA = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger, redisA),
      redis: redisA,
    }).app;

    appB = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger, redisB),
      redis: redisB,
    }).app;
  });

  it('consumer on replica B receives chunks produced by replica A', async () => {
    const q = 'cross-replica-q1';

    await request(appA)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk, finishChunk))
      .expect(200);
    await request(appA).post(`/stream/${q}/complete`).expect(200);

    const events = await consumeSSE(
      appB,
      `/stream/${q}?from-beginning=true`,
      8000
    );

    expect(events.at(-1)).toBe('[DONE]');
    const chunks = events.slice(0, -1);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(chunks[0]).choices[0].delta.content).toBe('hello');
  });

  it('GET /stream (paginated) on B shows chunks written by A', async () => {
    const q = 'cross-replica-q2';

    await request(appA)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk))
      .expect(200);

    const res = await request(appB).get('/stream').expect(200);
    const items = res.body.items as {data: {queryId: string}}[];
    expect(items.some((i) => i.data.queryId === q)).toBe(true);
  });
});
