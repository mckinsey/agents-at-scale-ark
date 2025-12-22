import request from 'supertest';
import app from '../src/server.js';

describe('Stream Timeout', () => {
  test('should send SSE error event with [DONE] on timeout', async () => {
    const response = await request(app)
      .get('/stream/nonexistent-query?wait-for-query=1')  // 1 second timeout
      .set('Accept', 'text/event-stream');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    // Should contain error event with streaming timeout message
    expect(response.text).toContain('data: {"error":{');
    expect(response.text).toContain('Request timeout waiting for streaming query response');
    expect(response.text).toContain('"type":"timeout_error"');
    expect(response.text).toContain('"code":"timeout"');

    // Must end with [DONE] marker
    expect(response.text).toContain('data: [DONE]');
  }, 10000);  // 10 second jest timeout
});
