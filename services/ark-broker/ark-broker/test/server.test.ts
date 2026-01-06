import request from 'supertest';
import app from '../src/server.js';

describe('ARK Broker API', () => {
  afterEach(async () => {
      const getResponse = await request(app).delete('/messages');
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.message).toEqual("Memory purged");
   });

  describe('Health Check', () => {
    test('GET /health should return OK', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('Single Message Endpoints', () => {
    test('should initially have no messages', async () => {
      const response = await request(app).get('/messages?conversation_id=test-conversation');

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);
    });

    test('should add and retrieve single message', async () => {
      const message = { role: 'user', content: 'Hello, world!' };

      // Add message
      const addResponse = await request(app)
        .post('/messages')
        .send({ conversation_id: 'test-conversation-single', query_id: 'query1', messages: [message] });

      expect(addResponse.status).toBe(200);

      // Retrieve messages
      const getResponse = await request(app).get('/messages?conversation_id=test-conversation-single');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.items).toHaveLength(1);
      expect(getResponse.body.items[0].message).toEqual(message);
      expect(getResponse.body.items[0].sequence).toBe(1);
    });

    test('should add multiple messages sequentially', async () => {
      const message1 = { role: 'user', content: 'First message' };
      const message2 = { role: 'assistant', content: 'Second message' };

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'test-conversation-2', query_id: 'query2', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'test-conversation-2', query_id: 'query2', messages: [message2] });

      const response = await request(app).get('/messages?conversation_id=test-conversation-2');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].message).toEqual(message1);
      expect(response.body.items[1].message).toEqual(message2);
      expect(response.body.items[0].sequence).toBe(1);
      expect(response.body.items[1].sequence).toBe(2);
    });

    test('should return error for missing conversation_id', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ query_id: 'query1', messages: [{ role: 'user', content: 'test' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('conversation_id is required');
    });

    test('should return error for missing query_id', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ conversation_id: 'test-conv' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('query_id is required');
    });
  });

  describe('Conversation Endpoints', () => {
    test('POST /conversations should create a new conversation with UUID', async () => {
      const response = await request(app).post('/conversations');

      expect(response.status).toBe(201);
      expect(response.body.conversation_id).toBeDefined();
      expect(response.body.conversation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('GET /conversations/:id should return conversation details', async () => {
      const message = { role: 'user', content: 'Hello' };

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'get-test-conv', query_id: 'q1', messages: [message] });

      const response = await request(app).get('/conversations/get-test-conv');

      expect(response.status).toBe(200);
      expect(response.body.conversation_id).toBe('get-test-conv');
      expect(response.body.messages).toHaveLength(1);
      expect(response.body.messages[0].message).toEqual(message);
    });

    test('GET /conversations/:id should return 404 for non-existent conversation', async () => {
      const response = await request(app).get('/conversations/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Conversation not found');
    });

    test('GET /conversations should list all conversations', async () => {
      await request(app)
        .post('/messages')
        .send({ conversation_id: 'list-conv-1', query_id: 'q1', messages: [{ role: 'user', content: 'test' }] });

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'list-conv-2', query_id: 'q2', messages: [{ role: 'user', content: 'test' }] });

      const response = await request(app).get('/conversations');

      expect(response.status).toBe(200);
      expect(response.body.conversations).toContain('list-conv-1');
      expect(response.body.conversations).toContain('list-conv-2');
    });

    test('DELETE /conversations/:id should delete conversation', async () => {
      await request(app)
        .post('/messages')
        .send({ conversation_id: 'delete-conv', query_id: 'q1', messages: [{ role: 'user', content: 'test' }] });

      const deleteResponse = await request(app).delete('/conversations/delete-conv');
      expect(deleteResponse.status).toBe(200);

      const getResponse = await request(app).get('/conversations/delete-conv');
      expect(getResponse.status).toBe(404);
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
        .send({ conversation_id: 'batch-conversation', query_id: 'batch-query', messages });

      expect(addResponse.status).toBe(200);

      // Retrieve messages
      const getResponse = await request(app).get('/messages?conversation_id=batch-conversation');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.items).toHaveLength(2);
      expect(getResponse.body.items[0].message).toEqual(messages[0]);
      expect(getResponse.body.items[1].message).toEqual(messages[1]);
      expect(getResponse.body.items[0].sequence).toBe(1);
      expect(getResponse.body.items[1].sequence).toBe(2);
    });

    test('should return error for invalid messages array', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ conversation_id: 'test-conversation', query_id: 'query1', messages: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('messages array is required');
    });
  });

  describe('Conversation Isolation', () => {
    test('should keep different conversations separate', async () => {
      const message1 = { role: 'user', content: 'Message for conversation 1' };
      const message2 = { role: 'user', content: 'Message for conversation 2' };

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'conversation1', query_id: 'q1', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'conversation2', query_id: 'q2', messages: [message2] });

      // Check conversation1
      const response1 = await request(app).get('/messages?conversation_id=conversation1');
      expect(response1.body.items).toHaveLength(1);
      expect(response1.body.items[0].message).toEqual(message1);

      // Check conversation2
      const response2 = await request(app).get('/messages?conversation_id=conversation2');
      expect(response2.body.items).toHaveLength(1);
      expect(response2.body.items[0].message).toEqual(message2);
    });
  });

  describe('Sequence Number Ordering', () => {
    test('should maintain correct sequence order across conversations', async () => {
      const message1 = { role: 'user', content: 'First message' };
      const message2 = { role: 'user', content: 'Second message' };
      const message3 = { role: 'user', content: 'Third message' };

      // Add messages in different conversations
      await request(app)
        .post('/messages')
        .send({ conversation_id: 'conversation1', query_id: 'q1', messages: [message1] });

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'conversation2', query_id: 'q2', messages: [message2] });

      await request(app)
        .post('/messages')
        .send({ conversation_id: 'conversation1', query_id: 'q1', messages: [message3] });

      // Get all messages (no conversation filter)
      const response = await request(app).get('/messages');

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(3);

      // Messages should be in sequence order (1, 2, 3)
      expect(response.body.items[0].sequence).toBe(1);
      expect(response.body.items[1].sequence).toBe(2);
      expect(response.body.items[2].sequence).toBe(3);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    test('should handle missing conversation_id', async () => {
      const response = await request(app)
        .post('/messages')
        .send({ query_id: 'q1', messages: [{ role: 'user', content: 'test' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('conversation_id is required');
    });
  });
});