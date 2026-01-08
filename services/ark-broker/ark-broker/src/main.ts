import { createRequire } from 'module';
import app, { memory, chunks, traces, events } from './server.js';
import { setupSwagger } from './swagger.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

setupSwagger(app, version);

const PORT = process.env.PORT || '8080';
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(parseInt(PORT), HOST, () => {
  console.log(`ARK Broker service running on http://${HOST}:${PORT}`);
});

const gracefulShutdown = (): void => {
  console.log('Shutting down gracefully');
  memory.save();
  chunks.save();
  traces.save();
  events.save();
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
