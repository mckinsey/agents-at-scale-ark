import {createLogger} from '../src/logging/logger.js';
import {MemoryBroker} from '../src/brokers/memory-broker.js';
import {InMemoryStream} from '../src/brokers/stream/in-memory-stream.js';
import type {MessageData} from '../src/brokers/memory-broker.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('MemoryBroker', () => {
  let broker: MemoryBroker;

  beforeEach(() => {
    broker = new MemoryBroker(
      new InMemoryStream<MessageData>(silentLogger, 'Memory')
    );
  });

  describe('addMessage', () => {
    test('should add a single message', async () => {
      const item = await broker.addMessage('conv1', 'query1', {
        role: 'user',
        content: 'Hello',
      });

      expect(item.sequenceNumber).toBe(1);
      expect(item.data.conversationId).toBe('conv1');
      expect(item.data.queryId).toBe('query1');
      expect(item.data.message).toEqual({role: 'user', content: 'Hello'});
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    test('should assign sequential sequence numbers', async () => {
      const item1 = await broker.addMessage('conv1', 'query1', 'message1');
      const item2 = await broker.addMessage('conv1', 'query1', 'message2');
      const item3 = await broker.addMessage('conv2', 'query2', 'message3');

      expect(item1.sequenceNumber).toBe(1);
      expect(item2.sequenceNumber).toBe(2);
      expect(item3.sequenceNumber).toBe(3);
    });
  });

  describe('addMessages', () => {
    test('should add multiple messages', async () => {
      const messages = ['message1', 'message2', 'message3'];
      const items = await broker.addMessages('conv1', 'query1', messages);

      expect(items).toHaveLength(3);
      expect(items[0].sequenceNumber).toBe(1);
      expect(items[1].sequenceNumber).toBe(2);
      expect(items[2].sequenceNumber).toBe(3);
    });
  });

  describe('getByConversation', () => {
    test('should return messages for specific conversation', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');
      await broker.addMessage('conv1', 'query3', 'message3');

      const conv1Messages = await broker.getByConversation('conv1');

      expect(conv1Messages).toHaveLength(2);
      expect(conv1Messages[0].data.message).toBe('message1');
      expect(conv1Messages[1].data.message).toBe('message3');
    });

    test('should return empty array for non-existent conversation', async () => {
      const messages = await broker.getByConversation('non-existent');
      expect(messages).toEqual([]);
    });
  });

  describe('getByQuery', () => {
    test('should return messages for specific query', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv1', 'query2', 'message2');
      await broker.addMessage('conv2', 'query1', 'message3');

      const query1Messages = await broker.getByQuery('query1');

      expect(query1Messages).toHaveLength(2);
      expect(query1Messages[0].data.message).toBe('message1');
      expect(query1Messages[1].data.message).toBe('message3');
    });
  });

  describe('getConversationIds', () => {
    test('should return unique conversation IDs', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');
      await broker.addMessage('conv1', 'query3', 'message3');

      const conversationIds = await broker.getConversationIds();

      expect(conversationIds).toHaveLength(2);
      expect(conversationIds).toContain('conv1');
      expect(conversationIds).toContain('conv2');
    });
  });

  describe('all', () => {
    test('should return all messages', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');

      const allMessages = await broker.all();

      expect(allMessages).toHaveLength(2);
    });
  });

  describe('deleteConversation', () => {
    test('should delete all messages for a conversation', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');
      await broker.addMessage('conv1', 'query3', 'message3');

      await broker.deleteConversation('conv1');

      const allMessages = await broker.all();
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].data.conversationId).toBe('conv2');
    });
  });

  describe('deleteQuery', () => {
    test('should delete messages for specific query in conversation', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv1', 'query2', 'message2');
      await broker.addMessage('conv1', 'query1', 'message3');

      await broker.deleteQuery('conv1', 'query1');

      const allMessages = await broker.all();
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].data.queryId).toBe('query2');
    });
  });

  describe('delete', () => {
    test('should delete all messages when called without predicate', async () => {
      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');

      await broker.delete();

      expect(await broker.all()).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    test('should notify subscriber when message is added', async () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribe((item) => {
        received.push(item.data.message);
      });

      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv1', 'query1', 'message2');

      expect(received).toEqual(['message1', 'message2']);

      unsubscribe();
    });

    test('should stop notifying after unsubscribe', async () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribe((item) => {
        received.push(item.data.message);
      });

      await broker.addMessage('conv1', 'query1', 'message1');
      unsubscribe();
      await broker.addMessage('conv1', 'query1', 'message2');

      expect(received).toEqual(['message1']);
    });
  });

  describe('subscribeToConversation', () => {
    test('should only notify for messages in specific conversation', async () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribeToConversation('conv1', (item) => {
        received.push(item.data.message);
      });

      await broker.addMessage('conv1', 'query1', 'message1');
      await broker.addMessage('conv2', 'query2', 'message2');
      await broker.addMessage('conv1', 'query3', 'message3');

      expect(received).toEqual(['message1', 'message3']);

      unsubscribe();
    });
  });
});
