import {EventEmitter} from 'node:events';
import type {Express, Request, Response} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createDb} from '../src/db/db.js';
import {MemoryBroker} from '../src/brokers/memory-broker.js';
import {handleStreamingMessages} from '../src/http/routes/memory/handlers.js';
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

describeIntegration('postgres backend — HTTP integration', () => {
  const {db, connectionUrl} = usePgContainer();
  let app: Express;
  let memory: MemoryBroker;

  beforeAll(() => {
    const config = loadConfig({
      MESSAGE_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    const stream = createMessageStream(config, logger, db());
    memory = new MemoryBroker(stream);
    ({app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: stream,
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
      db: db(),
    }));
  });

  it('POST /messages stores and GET /messages retrieves from Postgres', async () => {
    const message = {role: 'user', content: 'hello postgres'};

    await request(app)
      .post('/messages')
      .send({conversation_id: 'conv-1', query_id: 'q-1', messages: [message]})
      .expect(200);

    const res = await request(app)
      .get('/messages?conversation_id=conv-1')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].message).toEqual(message);
  });

  it('POST /messages with multiple messages stores and returns them in the same order', async () => {
    const messages = ['first', 'second', 'third', 'fourth', 'fifth'];

    await request(app)
      .post('/messages')
      .send({conversation_id: 'conv-batch', query_id: 'q-batch', messages})
      .expect(200);

    const res = await request(app)
      .get('/messages?conversation_id=conv-batch')
      .expect(200);

    expect(res.body.items).toHaveLength(messages.length);
    expect(
      res.body.items.map((item: {message: string}) => item.message)
    ).toEqual(messages);
  });

  it('messages survive a stream instance restart against the same database', async () => {
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-2',
        query_id: 'q-2',
        messages: [{role: 'user', content: 'durable'}],
      })
      .expect(200);

    const config = loadConfig({
      MESSAGE_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    const freshDb = createDb(config, logger);
    const freshStream = createMessageStream(config, logger, freshDb);
    const {app: freshApp} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: freshStream,
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
      db: freshDb,
    });

    const res = await request(freshApp)
      .get('/messages?conversation_id=conv-2')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect((res.body.items[0].message as {content: string}).content).toBe(
      'durable'
    );

    await freshDb.end({timeout: 5});
  });

  it('GET /readyz returns 200 when the database is reachable', async () => {
    await request(app).get('/readyz').expect(200);
  });

  it('GET /messages?conversation_id= returns only that conversation when multiple conversations exist', async () => {
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-scope-a',
        query_id: 'q-scope-a',
        messages: ['a1', 'a2'],
      })
      .expect(200);
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-scope-b',
        query_id: 'q-scope-b',
        messages: ['b1'],
      })
      .expect(200);

    const res = await request(app)
      .get('/messages?conversation_id=conv-scope-a')
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    for (const item of res.body.items as {conversation_id: string}[]) {
      expect(item.conversation_id).toBe('conv-scope-a');
    }
  });

  it('watch-mode reconnect with a cursor replays only items after the cursor, scoped to conversation_id', async () => {
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-replay',
        query_id: 'q-replay',
        messages: ['first', 'second'],
      })
      .expect(200); // sequence 1, 2
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-other',
        query_id: 'q-other',
        messages: ['other'],
      })
      .expect(200); // sequence 3, higher than the cursor but a different conversation

    const events = await captureReplay((req, res) =>
      handleStreamingMessages(req, res, memory, 'conv-replay', 1)
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      conversation_id: 'conv-replay',
      message: 'second',
    });
  });

  it('a scoped read on conversation_id uses a conversation_id-leading index, not a sequential scan', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/messages')
        .send({
          conversation_id: 'conv-explain',
          query_id: `q-explain-${i}`,
          messages: ['m'],
        })
        .expect(200);
    }

    const plan = await db().begin(async (sql) => {
      await sql`SET LOCAL enable_seqscan = off`;
      const rows = await sql.unsafe(`
        EXPLAIN ANALYZE
        SELECT sequence_number, conversation_id, query_id, message, created_at
        FROM messages
        WHERE expires_at > now() AND conversation_id = 'conv-explain'
        ORDER BY sequence_number ASC
        LIMIT 101
      `);
      return (rows as unknown as {'QUERY PLAN': string}[])
        .map((row) => row['QUERY PLAN'])
        .join('\n');
    });

    // messages_conversation_query_idx (added for conversationStats) also
    // starts with conversation_id, so the planner may pick either index
    // over a sequential scan.
    expect(plan).toMatch(/messages_conversation_(idx|query_idx)/);
  });

  it('the conversationStats aggregate uses messages_conversation_query_idx once the planner has fresh stats', async () => {
    // A handful of rows isn't representative: the planner needs a
    // realistically sized table (and fresh stats, mirroring what autovacuum
    // provides in production) before it prefers this index over a full
    // expires_at scan + explicit sort.
    const pgDb = db();
    const conversationCount = 40;
    const messagesPerConversation = 150;
    const rows: {
      conversation_id: string;
      query_id: string;
      message: string;
      expires_at: Date;
    }[] = [];
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    for (let c = 0; c < conversationCount; c++) {
      for (let m = 0; m < messagesPerConversation; m++) {
        rows.push({
          conversation_id: `conv-stats-explain-${c}`,
          query_id: `q-stats-explain-${c}-${m % 10}`,
          message: JSON.stringify({role: 'user', content: `m${m}`}),
          expires_at: expiresAt,
        });
      }
    }
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      await pgDb`
        INSERT INTO messages ${pgDb(
          rows.slice(i, i + batchSize),
          'conversation_id',
          'query_id',
          'message',
          'expires_at'
        )}
      `;
    }
    await pgDb.unsafe('ANALYZE messages');

    const rowsExplain = await pgDb.unsafe(`
      EXPLAIN ANALYZE
      SELECT
        conversation_id,
        count(*)::int AS message_count,
        count(DISTINCT query_id)::int AS query_count
      FROM messages
      WHERE expires_at > now()
      GROUP BY conversation_id
    `);
    const plan = (rowsExplain as unknown as {'QUERY PLAN': string}[])
      .map((row) => row['QUERY PLAN'])
      .join('\n');

    expect(plan).toContain('messages_conversation_query_idx');
  });

  it('DELETE /queries/:queryId/messages removes only that query rows', async () => {
    await request(app)
      .post('/messages')
      .send({conversation_id: 'del-conv-1', query_id: 'del-q', messages: ['a']})
      .expect(200);
    await request(app)
      .post('/messages')
      .send({conversation_id: 'del-conv-2', query_id: 'del-q', messages: ['b']})
      .expect(200);
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'del-conv-1',
        query_id: 'keep-q',
        messages: ['c'],
      })
      .expect(200);

    await request(app).delete('/queries/del-q/messages').expect(200);

    const res = await request(app).get('/messages').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].query_id).toBe('keep-q');
  });

  it('GET /memory-status aggregates per-conversation counts via a single query', async () => {
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'status-conv-1',
        query_id: 'status-q1',
        messages: ['one', 'two'],
      })
      .expect(200);
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'status-conv-1',
        query_id: 'status-q2',
        messages: ['three'],
      })
      .expect(200);
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'status-conv-2',
        query_id: 'status-q3',
        messages: ['four'],
      })
      .expect(200);

    const res = await request(app).get('/memory-status').expect(200);

    expect(res.body.total_conversations).toBe(2);
    expect(res.body.total_messages).toBe(4);
    expect(res.body.conversations['status-conv-1']).toEqual({
      message_count: 3,
      query_count: 2,
    });
    expect(res.body.conversations['status-conv-2']).toEqual({
      message_count: 1,
      query_count: 1,
    });
  });

  it('expired messages are not returned by GET /messages', async () => {
    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-3',
        query_id: 'q-3',
        messages: [{role: 'user', content: 'expires soon'}],
        ttl_seconds: 1,
      })
      .expect(200);

    const before = await request(app)
      .get('/messages?conversation_id=conv-3')
      .expect(200);
    expect(before.body.items).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const after = await request(app)
      .get('/messages?conversation_id=conv-3')
      .expect(200);
    expect(after.body.items).toHaveLength(0);
  });
});
