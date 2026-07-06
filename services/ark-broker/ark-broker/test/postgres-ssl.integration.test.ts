import type {Express} from 'express';
import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';
import {createChunkStream} from '../src/brokers/stream/chunk-stream-factory.js';
import {createEventStream} from '../src/brokers/stream/event-stream-factory.js';
import {usePgContainerSsl} from '../src/db/__tests__/testHelpers/pg-testcontainer.js';

jest.setTimeout(120_000);

const logger = createLogger({level: 'silent', pretty: false});

const describeIntegration =
  process.env.SKIP_INTEGRATION === 'true' ? describe.skip : describe;

describeIntegration('postgres backend — SSL connection', () => {
  const {db, connectionUrl} = usePgContainerSsl();
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
      chunkStream: createChunkStream(config, logger),
      eventStream: createEventStream(config, logger),
      db: db(),
    }));
  });

  it('connects to Postgres over SSL (sslmode=require)', async () => {
    const rows = await db()<{ssl: boolean}[]>`
      SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].ssl).toBe(true);
  });

  it('POST /messages and GET /messages work over an SSL connection', async () => {
    const message = {role: 'user', content: 'hello over ssl'};

    await request(app)
      .post('/messages')
      .send({
        conversation_id: 'ssl-conv-1',
        query_id: 'ssl-q-1',
        messages: [message],
      })
      .expect(200);

    const res = await request(app)
      .get('/messages?conversation_id=ssl-conv-1')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].message).toEqual(message);
  });
});
