import request from 'supertest';
import {loadConfig} from '../src/config/index.js';
import {createLogger} from '../src/logging/logger.js';
import {buildApp} from '../src/server.js';
import {createMessageStream} from '../src/brokers/stream/message-stream-factory.js';

const config = loadConfig({});
const logger = createLogger({level: 'silent', pretty: false});
const {app} = buildApp({
  config,
  logger,
  version: 'test',
  messageStream: createMessageStream(config, logger),
});

describe('Stream Timeout', () => {
  test('should send SSE error event with [DONE] on timeout', async () => {
    const response = await request(app)
      .get('/stream/nonexistent-query?wait-for-query=1') // 1 second timeout
      .set('Accept', 'text/event-stream');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    // Should contain error event with streaming timeout message
    expect(response.text).toContain('data: {"error":{');
    expect(response.text).toContain(
      'Request timeout waiting for streaming query response'
    );
    expect(response.text).toContain('"type":"timeout_error"');
    expect(response.text).toContain('"code":"timeout"');

    // Must end with [DONE] marker
    expect(response.text).toContain('data: [DONE]');
  }, 10000); // 10 second jest timeout
});
