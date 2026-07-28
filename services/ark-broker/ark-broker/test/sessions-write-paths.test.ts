import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {createSessionsStorage} from '../src/brokers/sessions/sessions-storage-factory.js';
import {PostgresSessionsStorage} from '../src/brokers/sessions/postgres-sessions-storage.js';
import type {Db} from '../src/db/db.js';

const config = loadConfig({});
const logger = createLogger({level: 'silent', pretty: false});

describe('POST /messages with no messages', () => {
  const {app, brokers} = buildApp({
    config,
    logger,
    version: 'test',
    messageStream: createMessageStream(config, logger),
    chunkStream: createChunkStream(config, logger),
    eventStream: createEventStream(config, logger),
    sessionsStorage: createSessionsStorage(config, logger),
  });

  afterEach(async () => {
    await brokers.sessions.delete();
    await brokers.memory.delete();
  });

  test('still attaches the query to its conversation', async () => {
    // An empty array is valid input, and it is still the call that tells the
    // sessions read model which conversation the query belongs to. Skipping
    // applyMessage for it leaves the query unattached.
    await brokers.sessions.applyEvent({
      sessionId: 'sess-1',
      queryName: 'query-1',
      agent: 'agent-a',
    });

    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'conv-1',
        query_id: 'query-1',
        messages: [],
      })
      .expect(200);

    const session = (await brokers.sessions.getSession('sess-1'))!;
    expect(session.queries['query-1']!.conversationId).toBe('conv-1');
    expect(session.conversations).toHaveLength(1);
  });
});

describe('PostgresSessionsStorage listen registration', () => {
  test('retries when the first attempt fails, so the replica is not left deaf', async () => {
    // postgres.js only re-registers channels when an established listen
    // connection drops. If the first attempt is the one that fails - a replica
    // booting mid-failover - there is nothing to re-register, and that pod
    // serves reads normally while never delivering a live update again.
    const attempts: string[] = [];
    const db = {
      listen: (channel: string): Promise<void> => {
        attempts.push(channel);
        return attempts.length === 1
          ? Promise.reject(new Error('connection refused'))
          : Promise.resolve();
      },
    } as unknown as Db;

    const storage = new PostgresSessionsStorage(logger, db, 3600);
    await storage.whenListening();

    expect(attempts).toEqual(['sessions_updated', 'sessions_updated']);
  });
});
