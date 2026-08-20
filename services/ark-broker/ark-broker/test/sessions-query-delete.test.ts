import {mkdtempSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
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

// The flush matters only when the in-memory backend is persisting: without it
// the route leaves the removal in a 2s debounce, and a kill inside that window
// reloads a query the cluster has already deleted.
describe('DELETE /sessions/queries/:query_id with persistence enabled', () => {
  test('the removal is on disk before the response returns', async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), 'ark-sessions-')),
      'store.json'
    );
    const persistedConfig = loadConfig({SESSIONS_FILE_PATH: path});
    const {app: persistedApp} = buildApp({
      config: persistedConfig,
      logger,
      version: 'test',
      messageStream: createMessageStream(persistedConfig, logger),
      chunkStream: createChunkStream(persistedConfig, logger),
      eventStream: createEventStream(persistedConfig, logger),
      sessionsStorage: createSessionsStorage(persistedConfig, logger),
    });

    await request(persistedApp)
      .post('/sessions')
      .send({sessionId: 'sess-1', queryName: 'query-1'})
      .expect(201);
    await request(persistedApp)
      .post('/sessions')
      .send({sessionId: 'sess-1', queryName: 'query-2'})
      .expect(201);

    await request(persistedApp).delete('/sessions/queries/query-1').expect(200);

    const onDisk = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Object.keys(onDisk.sessions['sess-1'].queries)).toEqual(['query-2']);
  });
});
