import {EventEmitter} from 'node:events';
import type {Express, Request, Response} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createDb, type Db} from '../src/db/db.js';
import type {SessionsBroker} from '../src/brokers/sessions-broker.js';
import {handleStreamingSessions} from '../src/http/routes/sessions/handlers.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {createSessionsStorage} from '../src/brokers/sessions/sessions-storage-factory.js';
import type {PostgresSessionsStorage} from '../src/brokers/sessions/postgres-sessions-storage.js';
import {usePgContainer} from '../src/db/__tests__/testHelpers/pg-testcontainer.js';
import {sleep} from '../src/brokers/sessions/__tests__/testHelpers/sleep.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

/**
 * Drives handleStreamingSessions with an in-process fake req/res (an
 * EventEmitter and a write-capturing stub), the same technique
 * postgres-backend.integration.test.ts uses for reconnect replay, instead of
 * a real socket. A real SSE response never naturally ends, and driving one
 * through supertest against an ephemeral per-request server means the only
 * way to stop consuming it is req.abort() - which turns out to interact
 * badly with that ephemeral-server model (aborting mid-stream can surface
 * as a suite-level "aborted" failure unrelated to any single test). This
 * sidesteps sockets entirely while still exercising the real handler,
 * SessionsBroker, and Postgres LISTEN/NOTIFY underneath it.
 */
async function watchSessions(
  sessionsBroker: SessionsBroker,
  sessionId: string | undefined,
  produce: () => Promise<void>,
  minNotifications = 1
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

  // streamSSE registers its subscription synchronously and buffers anything
  // that arrives before the replay is flushed, so nothing needs to be waited
  // for here - the LISTEN handshake is awaited once in beforeAll.
  handleStreamingSessions(fakeReq, fakeRes, sessionsBroker, sessionId);

  await produce();

  // Waiting a fixed span for the NOTIFY round-trip costs that span on every
  // call and still has no ceiling when a loaded container is slower than it.
  // Each caller knows how many notifications its writes should produce, so
  // wait for exactly those and give up at a deadline instead.
  const dataLines = (): number =>
    writes.filter((chunk) => chunk.startsWith('data: ')).length;
  const deadline = Date.now() + 5_000;
  while (dataLines() < minNotifications && Date.now() < deadline) {
    await sleep(25);
  }

  reqEmitter.emit('close');

  return writes
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6, -2)));
}

function postEvent(
  app: Express,
  fields: {
    sessionId: string;
    queryName: string;
    reason?: string;
    agent?: string;
    team?: string;
    tool?: string;
    targetType?: string;
    conversationId?: string;
    error?: string;
  }
): request.Test {
  const {sessionId, queryName, reason, ...rest} = fields;
  return request(app)
    .post('/events')
    .send({
      timestamp: new Date().toISOString(),
      eventType: reason ?? 'AgentExecutionStart',
      reason: reason ?? 'AgentExecutionStart',
      message: 'test event',
      data: {
        queryId: queryName,
        queryName,
        queryNamespace: 'default',
        sessionId,
        ...rest,
      },
    });
}

describeIntegration('postgres sessions backend — cross-replica', () => {
  const {connectionUrl} = usePgContainer();
  let appA: Express;
  let appB: Express;
  let sessionsB: SessionsBroker;
  let storageB: PostgresSessionsStorage;
  let dbA: Db;
  let dbB: Db;

  beforeAll(async () => {
    const config = loadConfig({
      MESSAGE_BACKEND: 'postgres',
      EVENT_BACKEND: 'postgres',
      SESSIONS_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });

    dbA = createDb(config, logger);
    dbB = createDb(config, logger);

    const builtA = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger, dbA),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger, dbA),
      sessionsStorage: createSessionsStorage(config, logger, dbA),
      db: dbA,
    });
    appA = builtA.app;

    storageB = createSessionsStorage(
      config,
      logger,
      dbB
    ) as PostgresSessionsStorage;

    const builtB = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: createMessageStream(config, logger, dbB),
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger, dbB),
      sessionsStorage: storageB,
      db: dbB,
    });
    appB = builtB.app;
    sessionsB = builtB.brokers.sessions;

    // A NOTIFY that arrives before this replica's LISTEN handshake completes is
    // gone - there is no subscription to buffer it into.
    await storageB.whenListening();
  });

  afterAll(async () => {
    await dbA.end({timeout: 5});
    await dbB.end({timeout: 5});
  });

  it('a session created via replica A is visible from replica B', async () => {
    await postEvent(appA, {sessionId: 'sess-xr-1', queryName: 'q1'}).expect(
      201
    );

    const res = await request(appB).get('/sessions/sess-xr-1').expect(200);
    expect(res.body.sessionId).toBe('sess-xr-1');
    expect(res.body.queries.q1).toBeDefined();
  });

  it('a watcher on replica B receives a notification for an event posted through replica A', async () => {
    const notifications = await watchSessions(
      sessionsB,
      'sess-xr-2',
      async () => {
        await postEvent(appA, {sessionId: 'sess-xr-2', queryName: 'q1'}).expect(
          201
        );
      }
    );

    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const last = notifications.at(-1) as {
      sessionId: string;
      session: {queries: Record<string, unknown>};
    };
    expect(last.sessionId).toBe('sess-xr-2');
    expect(last.session.queries.q1).toBeDefined();
  });

  it('multiple queries in one session, posted through alternating replicas, aggregate correctly and are observed by a watcher on the other replica', async () => {
    const sessionId = 'sess-xr-multi';

    const notifications = await watchSessions(
      sessionsB,
      sessionId,
      async () => {
        await postEvent(appA, {
          sessionId,
          queryName: 'q1',
          conversationId: 'conv-1',
          agent: 'agent-a',
        }).expect(201);
        await postEvent(appB, {
          sessionId,
          queryName: 'q2',
          conversationId: 'conv-1',
          agent: 'agent-a',
          reason: 'QueryExecutionComplete',
          error: 'boom',
        }).expect(201);
        await postEvent(appA, {
          sessionId,
          queryName: 'q3',
          conversationId: 'conv-2',
          team: 'team-b',
          targetType: 'team',
          reason: 'QueryExecutionComplete',
        }).expect(201);
      },
      3
    );

    expect(notifications.length).toBeGreaterThanOrEqual(3);

    // Every notification round-trips through LISTEN/NOTIFY regardless of
    // which replica produced it - the last one should reflect all three
    // writes, whichever replica happened to persist them.
    const last = notifications.at(-1) as {
      session: {queries: Record<string, unknown>};
    };
    expect(Object.keys(last.session.queries).sort()).toEqual([
      'q1',
      'q2',
      'q3',
    ]);

    for (const app of [appA, appB]) {
      const res = await request(app).get(`/sessions/${sessionId}`).expect(200);
      expect(Object.keys(res.body.queries).sort()).toEqual(['q1', 'q2', 'q3']);
      expect(res.body.errorCount).toBe(1);
      expect(res.body.conversations).toHaveLength(2);

      const conv1 = res.body.conversations.find(
        (c: {conversationId: string}) => c.conversationId === 'conv-1'
      );
      expect(conv1.messageCount).toBe(2);
      expect(conv1.errorCount).toBe(1);

      const participantNames = res.body.participants
        .map((p: {name: string}) => p.name)
        .sort();
      expect(participantNames).toEqual(['agent-a', 'team-b']);
    }
  });
});
