import express from 'express';
import cors from 'cors';
import type {AppConfig} from './config/index.js';
import type {Logger} from './logging/logger.js';
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

export function buildApp(deps: {config: AppConfig; logger: Logger}): AppBundle {
  const {config, logger} = deps;
  const app = express();

  const memory = new MemoryBroker(
    config.persistence.memoryFilePath,
    config.limits.maxMessages
  );
  const chunks = new CompletionChunkBroker(
    config.persistence.streamFilePath,
    config.limits.maxChunks
  );
  const traces = new TraceBroker(
    config.persistence.traceFilePath,
    config.limits.maxSpans
  );
  const events = new EventBroker(
    config.persistence.eventFilePath,
    config.limits.maxEvents
  );
  const sessions = new SessionsBroker(config.persistence.sessionsFilePath);

  logger.info('brokers initialized');

  app.use(cors());
  app.use(express.json({limit: '10mb'}));

  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  app.use('/', createMemoryRouter(memory, sessions));
  app.use('/stream', createStreamRouter(chunks));
  app.use('/traces', createTracesRouter(traces));
  app.use('/events', createEventsRouter(events, sessions));
  app.use('/sessions', createSessionsRouter(sessions));
  app.use('/v1', createOTLPRouter(traces));

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Unhandled error:', err);
      res.status(500).json({error: 'Internal server error'});
    }
  );

  app.use((_req, res) => {
    res.status(404).json({error: 'Not found'});
  });

  return {app, brokers: {memory, chunks, traces, events, sessions}};
}
