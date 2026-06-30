import {createRequire} from 'module';
import {loadConfig} from './config/index.js';
import {createLogger} from './logging/logger.js';
import {buildApp} from './server.js';
import {createMessageStream} from './brokers/stream/message-stream-factory.js';
import {createChunkStream} from './brokers/stream/chunk-stream-factory.js';
import {createDb} from './db/db.js';
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

  const db =
    config.backends.message === 'postgres'
      ? createDb(config, logger)
      : undefined;

  const redis =
    config.backends.chunk === 'redis' ? createRedis(config, logger) : undefined;

  const messageStream = createMessageStream(config, logger, db);
  const chunkStream = createChunkStream(config, logger, redis);
  const {app, brokers} = buildApp({
    config,
    logger,
    version,
    messageStream,
    chunkStream,
    db,
    redis,
  });
  const {memory, chunks, traces, events, sessions} = brokers;

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(
      {host: config.server.host, port: config.server.port},
      'ark-broker listening'
    );
  });

  server.requestTimeout = config.server.requestTimeoutMs;

  const gracefulShutdown = async (): Promise<void> => {
    logger.info('shutting down gracefully');
    sessions.save();
    const results = await Promise.allSettled([
      memory.save(),
      chunks.save(),
      traces.save(),
      events.save(),
    ]);
    const brokerNames = ['memory', 'chunks', 'traces', 'events'];
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
