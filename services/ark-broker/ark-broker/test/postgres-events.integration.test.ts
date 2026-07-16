import type {Express} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {usePgContainer} from '../src/db/__tests__/testHelpers/pg-testcontainer.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

const baseEvent = {
  timestamp: new Date().toISOString(),
  eventType: 'QueryExecutionComplete',
  reason: 'Completed',
  message: 'query finished',
  data: {
    queryId: 'q-pg-events-1',
    queryName: 'test-query',
    queryNamespace: 'default',
    sessionId: 'sess-1',
  },
};

describeIntegration('postgres event backend — HTTP integration', () => {
  const {db, connectionUrl} = usePgContainer();
  let app: Express;

  beforeAll(() => {
    const config = loadConfig({
      EVENT_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    ({app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger, db()),
      db: db(),
    }));
  });

  it('POST /events stores and GET /events retrieves from Postgres', async () => {
    await request(app).post('/events').send(baseEvent).expect(201);

    const res = await request(app).get('/events').expect(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0] as typeof baseEvent;
    expect(item.eventType).toBe('QueryExecutionComplete');
    expect(item.data.queryId).toBe('q-pg-events-1');
  });

  it('GET /events/:queryId returns only events for that query', async () => {
    await request(app).post('/events').send(baseEvent).expect(201);
    await request(app)
      .post('/events')
      .send({...baseEvent, data: {...baseEvent.data, queryId: 'q-other'}})
      .expect(201);

    const res = await request(app).get('/events/q-pg-events-1').expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body.items as {data: {queryId: string}}[]) {
      expect(item.data.queryId).toBe('q-pg-events-1');
    }
  });

  it('events survive a stream instance restart against the same database', async () => {
    await request(app).post('/events').send(baseEvent).expect(201);

    const config = loadConfig({
      EVENT_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    const freshDb = db();
    const {app: freshApp} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger, freshDb),
      db: freshDb,
    });

    const res = await request(freshApp).get('/events').expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /events/:queryId removes only that query rows', async () => {
    await request(app).post('/events').send(baseEvent).expect(201);
    await request(app)
      .post('/events')
      .send({...baseEvent, data: {...baseEvent.data, queryId: 'q-other'}})
      .expect(201);

    await request(app).delete('/events/q-pg-events-1').expect(200);

    const res = await request(app).get('/events').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].data.queryId).toBe('q-other');
  });

  it('expired events are not returned (body ttl_seconds override)', async () => {
    const ttlEvent = {
      ...baseEvent,
      data: {...baseEvent.data, queryId: 'q-ttl-test'},
      ttl_seconds: 1,
    };

    await request(app).post('/events').send(ttlEvent).expect(201);

    const before = await request(app).get('/events/q-ttl-test').expect(200);
    expect(before.body.items).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const after = await request(app).get('/events/q-ttl-test').expect(200);
    expect(after.body.items).toHaveLength(0);
  });
});
