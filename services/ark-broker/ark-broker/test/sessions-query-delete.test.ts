import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {createSessionsStorage} from '../src/brokers/sessions/sessions-storage-factory.js';

const config = loadConfig({});
const logger = createLogger({level: 'silent', pretty: false});
const {
  app,
  brokers: {sessions},
} = buildApp({
  config,
  logger,
  version: 'test',
  messageStream: createMessageStream(config, logger),
  chunkStream: createChunkStream(config, logger),
  eventStream: createEventStream(config, logger),
  sessionsStorage: createSessionsStorage(config, logger),
});

describe('DELETE /sessions/queries/:query_id', () => {
  afterEach(async () => {
    await sessions.delete();
  });

  test('removes the query and reports how many sessions it came from', async () => {
    await sessions.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
    await sessions.applyEvent({sessionId: 'sess-1', queryName: 'query-2'});

    const res = await request(app)
      .delete('/sessions/queries/query-1')
      .expect(200);

    expect(res.body.removed).toBe(1);
    const session = await sessions.getSession('sess-1');
    expect(Object.keys(session!.queries)).toEqual(['query-2']);
  });

  // A 404 here would be read by the controller's finalizer as "this broker does
  // not implement the route" and skipped, hiding a genuine cleanup failure.
  test('answers 200, not 404, for a query it has never seen', async () => {
    const res = await request(app)
      .delete('/sessions/queries/never-existed')
      .expect(200);

    expect(res.body.removed).toBe(0);
  });
});
