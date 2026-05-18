import express from 'express';
import cors from 'cors';
import type {AppConfig} from './config/index.js';
import type {Logger} from './logging/logger.js';
import {
  createErrorHandler,
  notFoundHandler,
} from './middleware/error-handler.js';
import {createHttpLogger} from './middleware/http-logger.js';
import {requestId} from './middleware/request-id.js';
import {MemoryBroker} from './memory-broker.js';
import {CompletionChunkBroker} from './completion-chunk-broker.js';
import {TraceBroker} from './trace-broker.js';
import {EventBroker} from './event-broker.js';
import {SessionsBroker} from './sessions-broker.js';
import {createMemoryRouter} from './routes/memory.js';
import {createStreamRouter} from './routes/stream.js';
import {createTracesRouter} from './routes/traces.js';
import {createEventsRouter} from './routes/events.js';
import {createSessionsRouter} from './routes/sessions.js';
import {createOTLPRouter} from './routes/otlp.js';
import {setupSwagger} from './swagger.js';

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
}): AppBundle {
  const {config, logger, version} = deps;
  const app = express();

  const memory = new MemoryBroker(
    logger.child({broker: 'memory'}),
    config.persistence.memoryFilePath,
    config.limits.maxMessages
  );
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
