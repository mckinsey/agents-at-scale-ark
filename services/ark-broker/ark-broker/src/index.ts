import {createRequire} from 'module';
import {loadConfig} from './config/index.js';
import {createLogger} from './logging/logger.js';
import {buildApp} from './server.js';
import {createMessageStream} from './brokers/stream/message-stream-factory.js';
import {createChunkStream} from './brokers/stream/chunk-stream-factory.js';
import {createEventStream} from './brokers/stream/event-stream-factory.js';
import {createSessionsStorage} from './brokers/sessions/sessions-storage-factory.js';
import {createDb} from './db/db.js';
import {createReaper} from './db/reaper.js';
import {createRedis} from './redis/redis.js';

const require = createRequire(import.meta.url);
const {version} = require('../package.json');

const logger = createLogger({
  level: 'info',
  pretty: process.env.NODE_ENV === 'development',
});

const main = async (): Promise<void> => {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    logger.error({err}, 'invalid configuration');
    process.exit(1);
  }

  logger.level = config.logLevel;

  logger.info({backend: config.backends.message}, 'message backend');
  logger.info({backend: config.backends.chunk}, 'chunk backend');
  logger.info({backend: config.backends.event}, 'event backend');
  logger.info({backend: config.backends.sessions}, 'sessions backend');

  const needsDb =
    config.backends.message === 'postgres' ||
    config.backends.event === 'postgres' ||
    config.backends.sessions === 'postgres';
  const db = needsDb ? createDb(config, logger) : undefined;

  const redis =
    config.backends.chunk === 'redis' ? createRedis(config, logger) : undefined;

  const reapTables = [
    ...(config.backends.message === 'postgres' ? ['messages'] : []),
    ...(config.backends.event === 'postgres' ? ['events'] : []),
    ...(config.backends.sessions === 'postgres' ? ['sessions'] : []),
  ];
  const reaper =
    db && config.database.reapIntervalSeconds > 0
      ? createReaper({
          logger: logger.child({module: 'reaper'}),
          db,
          tables: reapTables,
          intervalSeconds: config.database.reapIntervalSeconds,
          batchSize: config.database.reapBatchSize,
        })
      : undefined;
  reaper?.start();

  const messageStream = createMessageStream(config, logger, db);
  const chunkStream = createChunkStream(config, logger, redis);
  const eventStream = createEventStream(config, logger, db);
  const sessionsStorage = createSessionsStorage(config, logger, db);

  // Bounded streaming load off disk must finish before the server accepts
  // traffic, so replay cursors are correct from the first request.
  await Promise.all([
    messageStream.init?.(),
    chunkStream.init?.(),
    eventStream.init?.(),
  ]);

  const {app, brokers} = buildApp({
    config,
    logger,
    version,
    messageStream,
    chunkStream,
    eventStream,
    sessionsStorage,
    db,
    redis,
  });
  const {memory, chunks, traces, events, sessions} = brokers;
  await traces.init();

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(
      {host: config.server.host, port: config.server.port},
      'ark-broker listening'
    );
  });

  server.requestTimeout = config.server.requestTimeoutMs;

  const gracefulShutdown = async (): Promise<void> => {
    logger.info('shutting down gracefully');
    await reaper?.stop();
    messageStream.close?.();
    chunkStream.close?.();
    eventStream.close?.();
    traces.close();
    const results = await Promise.allSettled([
      memory.save(),
      chunks.save(),
      traces.save(),
      events.save(),
      sessions.save(),
    ]);
    const brokerNames = ['memory', 'chunks', 'traces', 'events', 'sessions'];
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        logger.error(
          {broker: brokerNames[idx], err: result.reason},
          'save failed during shutdown'
        );
      }
    });
    if (db) {
      await db.end({timeout: 5});
    }
    if (redis) {
      await redis.quit();
    }
    server.close(() => {
      logger.info('process terminated');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    void gracefulShutdown();
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received');
    void gracefulShutdown();
  });
};

main().catch((err) => {
  logger.error({err}, 'fatal startup error');
  process.exit(1);
});
