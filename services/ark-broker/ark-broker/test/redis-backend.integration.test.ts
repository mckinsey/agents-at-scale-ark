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
  timeoutMs = 5000
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

describeIntegration('redis chunk backend — HTTP parity', () => {
  const {client, connectionUrl} = useRedisContainer();
  let app: Express;

  beforeAll(() => {
    const config = loadConfig({
      CHUNK_BACKEND: 'redis',
      REDIS_URL: connectionUrl(),
    });
    const redis = createRedis(config, logger);
    app = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger, redis),
      redis,
    }).app;
  });

  it('GET /readyz returns 200 with Redis configured', async () => {
    await request(app).get('/readyz').expect(200);
  });

  it('POST /stream stores chunks and GET paginated returns them', async () => {
    const q = 'redis-parity-q1';
    await request(app)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk, finishChunk))
      .expect(200);

    const res = await request(app).get('/stream').expect(200);
    const items = res.body.items as {data: {queryId: string}}[];
    expect(items.some((i) => i.data.queryId === q)).toBe(true);
  });

  it('POST /stream + complete, GET SSE from-beginning replays all and closes', async () => {
    const q = 'redis-parity-q2';
    await request(app)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk, finishChunk))
      .expect(200);
    await request(app).post(`/stream/${q}/complete`).expect(200);

    const events = await consumeSSE(
      app,
      `/stream/${q}?from-beginning=true`,
      5000
    );

    expect(events.at(-1)).toBe('[DONE]');
    const chunks = events.slice(0, -1);
    expect(chunks).toHaveLength(2);
    expect(JSON.parse(chunks[0]).choices[0].delta.content).toBe('hello');
  });

  it('DELETE /stream purges all chunk data', async () => {
    const q = 'redis-parity-q3';
    await request(app)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk))
      .expect(200);

    await request(app).delete('/stream').expect(200);

    const allKeys = await client().keys('ark-broker:chunks:*');
    expect(allKeys).toHaveLength(0);
  });

  it('POST /stream/:id/complete returns 404 for unknown query', async () => {
    await request(app).post('/stream/no-such-query/complete').expect(404);
  });

  it('GET /stream paginate returns correct items after cursor', async () => {
    const q = 'redis-parity-q4';
    await request(app)
      .post(`/stream/${q}`)
      .set('Content-Type', 'application/x-ndjson')
      .send(ndjson(textChunk, finishChunk))
      .expect(200);

    const first = await request(app).get('/stream?limit=1').expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.hasMore).toBe(true);
    const cursor = first.body.nextCursor as number;

    const second = await request(app)
      .get(`/stream?limit=10&cursor=${cursor}`)
      .expect(200);
    expect(second.body.items.length).toBeGreaterThanOrEqual(1);
  });
});
