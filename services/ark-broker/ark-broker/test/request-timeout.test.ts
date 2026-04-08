import http from 'http';
import app from '../src/server.js';

describe('Request Timeout Configuration', () => {
  let server: http.Server;

  afterEach((done) => {
    if (server?.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  test('should default to 0 (disabled) when REQUEST_TIMEOUT is not set', (done) => {
    delete process.env.REQUEST_TIMEOUT;
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '0');

    server = app.listen(0, () => {
      server.requestTimeout = timeout;
      expect(server.requestTimeout).toBe(0);
      done();
    });
  });

  test('should respect REQUEST_TIMEOUT environment variable', (done) => {
    process.env.REQUEST_TIMEOUT = '600000';
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '0');

    server = app.listen(0, () => {
      server.requestTimeout = timeout;
      expect(server.requestTimeout).toBe(600000);
      done();
    });
  });

  afterAll(() => {
    delete process.env.REQUEST_TIMEOUT;
  });
});
