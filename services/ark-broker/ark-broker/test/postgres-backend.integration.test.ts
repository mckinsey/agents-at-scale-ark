import type {Express} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createDb} from '../src/db/db.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {usePgContainer} from '../src/db/__tests__/testHelpers/pg-testcontainer.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

describeIntegration('postgres backend — HTTP integration', () => {
  const {db, connectionUrl} = usePgContainer();
  let app: Express;

  beforeAll(() => {
    const config = loadConfig({
      MESSAGE_BACKEND: 'postgres',
      DATABASE_URL: connectionUrl(),
    });
    const stream = createMessageStream(config, logger, db());
    ({app} = buildApp({
      config,
      logger,
      version: 'test',
      messageStream: stream,
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
