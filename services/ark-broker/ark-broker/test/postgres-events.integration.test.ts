import {EventEmitter} from 'node:events';
import type {Express, Request, Response} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {EventBroker} from '../src/brokers/event-broker.js';
import {
  handleStreamingAllEvents,
  handleStreamingQueryEvents,
} from '../src/http/routes/events/handlers.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {usePgContainer} from '../src/db/__tests__/testHelpers/pg-testcontainer.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

/**
 * Drives an SSE handler with an in-process fake req/res (an EventEmitter and
 * a write-capturing stub) instead of a real socket, so the reconnect replay
 * path can be asserted without the surrounding HTTP transport.
 */
async function captureReplay(
  run: (req: Request, res: Response) => void
): Promise<Record<string, unknown>[]> {
  const writes: string[] = [];
  const reqEmitter = new EventEmitter();
  const fakeReq = Object.assign(reqEmitter, {
    log: logger,
  }) as unknown as Request;
  const fakeRes = {
    setHeader: (): void => {},
    write: (chunk: string): boolean => {
      writes.push(chunk);
      return true;
    },
  } as unknown as Response;

  run(fakeReq, fakeRes);
  await new Promise((resolve) => setTimeout(resolve, 100));
  reqEmitter.emit('close');

  return writes
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6, -2)));
}

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
  let events: EventBroker;

  beforeAll(() => {
    const config = loadConfig({
      EVENT_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    const stream = createEventStream(config, logger, db());
    events = new EventBroker(stream);
    ({app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger),
      chunkStream: createChunkStream(config, logger),
      eventStream: stream,
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

  it('GET /events?session_id= returns only events for that session when multiple sessions exist', async () => {
    await request(app)
      .post('/events')
      .send({
        ...baseEvent,
        data: {
          ...baseEvent.data,
          queryId: 'q-sess-a',
          sessionId: 'sess-scope-a',
        },
      })
      .expect(201);
    await request(app)
      .post('/events')
      .send({
        ...baseEvent,
        data: {
          ...baseEvent.data,
          queryId: 'q-sess-b',
          sessionId: 'sess-scope-b',
        },
      })
      .expect(201);

    const res = await request(app)
      .get('/events?session_id=sess-scope-a')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].data.sessionId).toBe('sess-scope-a');
  });

  it('watch-mode reconnect with a cursor replays only items after the cursor, scoped to session_id', async () => {
    await request(app)
      .post('/events')
      .send({
        ...baseEvent,
        data: {...baseEvent.data, queryId: 'q-r1', sessionId: 'sess-replay'},
      })
      .expect(201); // sequence 1
    await request(app)
      .post('/events')
      .send({
        ...baseEvent,
        data: {...baseEvent.data, queryId: 'q-r2', sessionId: 'sess-replay'},
      })
      .expect(201); // sequence 2
    await request(app)
      .post('/events')
      .send({
        ...baseEvent,
        data: {...baseEvent.data, queryId: 'q-r3', sessionId: 'sess-other'},
      })
      .expect(201); // sequence 3, higher than the cursor but a different session

    const replayed = await captureReplay((req, res) =>
      handleStreamingAllEvents(req, res, events, 'sess-replay', 1)
    );

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({
      data: {queryId: 'q-r2', sessionId: 'sess-replay'},
    });
  });

  it('watch-mode reconnect on a query stream (not from-beginning) replays only that query events after the cursor', async () => {
    await request(app)
      .post('/events')
      .send({...baseEvent, data: {...baseEvent.data, queryId: 'q-qr'}})
      .expect(201); // sequence 1
    await request(app)
      .post('/events')
      .send({...baseEvent, data: {...baseEvent.data, queryId: 'q-qr'}})
      .expect(201); // sequence 2
    await request(app)
      .post('/events')
      .send({...baseEvent, data: {...baseEvent.data, queryId: 'q-other-qr'}})
      .expect(201); // sequence 3, higher than the cursor but a different query

    const replayed = await captureReplay((req, res) =>
      handleStreamingQueryEvents(req, res, events, 'q-qr', false, 1)
    );

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({data: {queryId: 'q-qr'}});
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
