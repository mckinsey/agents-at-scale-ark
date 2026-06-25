import express from 'express';
import cors from 'cors';
import type {AppConfig} from './config/index.js';
import type {Logger} from './logging/logger.js';
import {
  createErrorHandler,
  notFoundHandler,
} from './http/middleware/error-handler.js';
import {createHttpLogger} from './http/middleware/http-logger.js';
import {requestId} from './http/middleware/request-id.js';
import {MemoryBroker} from './brokers/memory-broker.js';
import type {MessageStream} from './brokers/stream/message-stream.js';
import {type Db, pingDb} from './db/db.js';
import {CompletionChunkBroker} from './brokers/chunks-broker.js';
import {TraceBroker} from './brokers/trace-broker.js';
import {EventBroker} from './brokers/event-broker.js';
import {SessionsBroker} from './brokers/sessions-broker.js';
import {createMemoryRouter} from './http/routes/memory/index.js';
import {createStreamRouter} from './http/routes/stream/index.js';
import {createTracesRouter} from './http/routes/traces/index.js';
import {createEventsRouter} from './http/routes/events/index.js';
import {createSessionsRouter} from './http/routes/sessions/index.js';
import {createOTLPRouter} from './http/routes/otlp.js';
import {setupSwagger} from './http/swagger.js';

export type Brokers = {
  memory: MemoryBroker;
  chunks: CompletionChunkBroker;
  traces: TraceBroker;
  events: EventBroker;
  sessions: SessionsBroker;
};

export type AppBundle = {
  app: express.Express;
  brokers: Brokers;
};

export function buildApp(deps: {
  config: AppConfig;
  logger: Logger;
  version: string;
  messageStream: MessageStream;
  db?: Db;
}): AppBundle {
  const {config, logger, version, messageStream, db} = deps;
  const app = express();

  const memory = new MemoryBroker(messageStream);
  const chunks = new CompletionChunkBroker(
    logger.child({broker: 'chunks'}),
    config.persistence.streamFilePath,
    config.limits.maxChunks
  );
  const traces = new TraceBroker(
    logger.child({broker: 'traces'}),
    config.persistence.traceFilePath,
    config.limits.maxSpans
  );
  const events = new EventBroker(
    logger.child({broker: 'events'}),
    config.persistence.eventFilePath,
    config.limits.maxEvents
  );
  const sessions = new SessionsBroker(
    logger.child({broker: 'sessions'}),
    config.persistence.sessionsFilePath
  );

  logger.info('brokers initialized');

  app.use(cors());
  app.use(express.json({limit: '10mb'}) as express.RequestHandler);
  app.use(requestId);
  app.use(createHttpLogger(logger));

  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  app.get('/readyz', async (_req, res) => {
    if (!db) {
      res.status(200).send('OK');
      return;
    }
    try {
      await pingDb(db);
      res.status(200).send('OK');
    } catch (err) {
      logger.warn({err}, 'readyz ping failed');
      res.status(503).send('Service Unavailable');
    }
  });

  app.use('/', createMemoryRouter(memory, sessions));
  app.use('/stream', createStreamRouter(chunks));
  app.use('/traces', createTracesRouter(traces));
  app.use('/events', createEventsRouter(events, sessions));
  app.use('/sessions', createSessionsRouter(sessions));
  app.use('/v1', createOTLPRouter(traces, logger.child({route: 'otlp'})));

  setupSwagger(app, {
    logger,
    version,
    host: config.server.host,
    port: config.server.port,
  });

  app.use(createErrorHandler({includeStack: config.nodeEnv === 'development'}));
  app.use(notFoundHandler);

  return {app, brokers: {memory, chunks, traces, events, sessions}};
}
