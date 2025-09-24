import request from 'supertest';
import app from '../src/server.js';

describe('ARK Cluster Memory API', () => {
  describe('Health Check', () => {
    test('GET /health should return OK', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('Single Message Endpoints', () => {
    test('should initially have no messages', async () => {
      const response = await request(app).get('/messages?session_id=test-session');

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual([]);
    });

    test('should add and retrieve single message', async () => {
      const message = { role: 'user', content: 'Hello, world!' };

      // Add message
      const addResponse = await request(app)
        .post('/messages')
        .send({ session_id: 'test-session-single', query_id: 'query1', messages: [message] });

      expect(addResponse.status).toBe(200);

      // Retrieve messages
      const getResponse = await request(app).get('/messages?session_id=test-session-single');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.messages).toHaveLength(1);
      expect(getResponse.body.messages[0].message).toEqual(message);
      expect(getResponse.body.messages[0].sequence).toBe(1);
    });

    test('should add multiple messages sequentially', async () => {
      const message1 = { role: 'user', content: 'First message' };
      const message2 = { role: 'assistant', content: 'Second message' };

      await request(app)
        .post('/messages')
        .send({ session_id: 'test-session-2', query_id: 'query2', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ session_id: 'test-session-2', query_id: 'query2', messages: [message2] });

      const response = await request(app).get('/messages?session_id=test-session-2');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0].message).toEqual(message1);
      expect(response.body.messages[1].message).toEqual(message2);
      expect(response.body.messages[0].sequence).toBe(1);
      expect(response.body.messages[1].sequence).toBe(2);
    });

    test('should return error for missing message', async () => {
      const response = await request(app)
        .post('/messages')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('session_id is required');
    });
  });

  describe('Multiple Messages Endpoints', () => {
    test('should add and retrieve multiple messages at once', async () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];

      // Add messages
      const addResponse = await request(app)
        .post('/messages')
        .send({ session_id: 'batch-session', query_id: 'batch-query', messages });

      expect(addResponse.status).toBe(200);

      // Retrieve messages
      const getResponse = await request(app).get('/messages?session_id=batch-session');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.messages).toHaveLength(2);
      expect(getResponse.body.messages[0].message).toEqual(messages[0]);
      expect(getResponse.body.messages[1].message).toEqual(messages[1]);
      expect(getResponse.body.messages[0].sequence).toBe(1);
      expect(getResponse.body.messages[1].sequence).toBe(2);
    });

    test('should return error for invalid messages array', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ session_id: 'test-session', query_id: 'query1', messages: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('messages array is required');
    });
  });

  describe('Session Isolation', () => {
    test('should keep different sessions separate', async () => {
      const message1 = { role: 'user', content: 'Message for session 1' };
      const message2 = { role: 'user', content: 'Message for session 2' };

      await request(app)
        .post('/messages')
        .send({ session_id: 'session1', query_id: 'q1', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ session_id: 'session2', query_id: 'q2', messages: [message2] });

      // Check session1
      const response1 = await request(app).get('/messages?session_id=session1');
      expect(response1.body.messages).toHaveLength(1);
      expect(response1.body.messages[0].message).toEqual(message1);

      // Check session2
      const response2 = await request(app).get('/messages?session_id=session2');
      expect(response2.body.messages).toHaveLength(1);
      expect(response2.body.messages[0].message).toEqual(message2);
    });
  });

  describe('Sequence Number Ordering', () => {
    test('should maintain correct sequence order across sessions', async () => {
      const message1 = { role: 'user', content: 'First message' };
      const message2 = { role: 'user', content: 'Second message' };
      const message3 = { role: 'user', content: 'Third message' };

      // Add messages in different sessions
      await request(app)
        .post('/messages')
        .send({ session_id: 'session1', query_id: 'q1', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ session_id: 'session2', query_id: 'q2', messages: [message2] });

      await request(app)
        .post('/messages')
        .send({ session_id: 'session1', query_id: 'q1', messages: [message3] });

      // Get all messages (no session filter)
      const response = await request(app).get('/messages');

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(3);
      
      // Messages should be in sequence order (1, 2, 3)
      expect(response.body.messages[0].sequence).toBe(1);
      expect(response.body.messages[1].sequence).toBe(2);
      expect(response.body.messages[2].sequence).toBe(3);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    test('should handle empty session ID', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ query_id: 'query1', messages: ['test'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('session_id is required');
    });
  });
});