import {createRequire} from 'module';
import {loadConfig, type AppConfig} from './config/index.js';
import {createLogger} from './logging/logger.js';
import {buildApp} from './server.js';
import {setupSwagger} from './swagger.js';

const require = createRequire(import.meta.url);
const {version} = require('../package.json');

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (err) {
    console.error('Invalid configuration:', err);
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const logger = createLogger({
  level: config.logLevel,
  pretty: config.nodeEnv === 'development',
});

const {app, brokers} = buildApp({config, logger});
const {memory, chunks, traces, events, sessions} = brokers;

setupSwagger(app, version);

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    {host: config.server.host, port: config.server.port},
    'ark-broker listening'
  );
});

server.requestTimeout = config.server.requestTimeoutMs;

const gracefulShutdown = (): void => {
  logger.info('shutting down gracefully');
  memory.save();
  chunks.save();
  traces.save();
  events.save();
  sessions.save();
  server.close(() => {
    logger.info('process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received');
  gracefulShutdown();
});
