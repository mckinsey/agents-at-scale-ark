import {createRequire} from 'module';
import {loadConfig, type AppConfig} from './config/index.js';
import {createLogger} from './logging/logger.js';
import {buildApp} from './server.js';

const require = createRequire(import.meta.url);
const {version} = require('../package.json');

const logger = createLogger({
  level: 'info',
  pretty: process.env.NODE_ENV === 'development',
});

let config: AppConfig;
try {
  config = loadConfig(process.env);
} catch (err) {
  logger.error({err}, 'invalid configuration');
  process.exit(1);
}

logger.level = config.logLevel;

const {app, brokers} = buildApp({config, logger, version});
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
