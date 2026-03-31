import { createServer } from 'http';
import app from '../src/server.js';

describe('Server Request Timeout Configuration', () => {
  test('should default requestTimeout to 0 (disabled) to support long-running streams', () => {
    const server = createServer(app);
    const timeout = process.env.REQUEST_TIMEOUT ? parseInt(process.env.REQUEST_TIMEOUT, 10) : 0;
    server.requestTimeout = timeout;
    expect(server.requestTimeout).toBe(0);
    server.close();
  });

  test('should respect REQUEST_TIMEOUT env var when set', () => {
    const original = process.env.REQUEST_TIMEOUT;
    process.env.REQUEST_TIMEOUT = '600000';

    const server = createServer(app);
    const timeout = process.env.REQUEST_TIMEOUT ? parseInt(process.env.REQUEST_TIMEOUT, 10) : 0;
    server.requestTimeout = timeout;
    expect(server.requestTimeout).toBe(600000);

    server.close();
    process.env.REQUEST_TIMEOUT = original;
  });
});
