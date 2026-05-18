import {createRequire} from 'module';
import {loadConfig, type AppConfig} from './config/index.js';
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
const {app, brokers} = buildApp({config});
const {memory, chunks, traces, events, sessions} = brokers;

setupSwagger(app, version);

const server = app.listen(config.server.port, config.server.host, () => {
  console.log(
    `ARK Broker service running on http://${config.server.host}:${config.server.port}`
  );
});

server.requestTimeout = config.server.requestTimeoutMs;

const gracefulShutdown = (): void => {
  console.log('Shutting down gracefully');
  memory.save();
  chunks.save();
  traces.save();
  events.save();
  sessions.save();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => {
  console.log('SIGTERM received');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT received');
  gracefulShutdown();
});
