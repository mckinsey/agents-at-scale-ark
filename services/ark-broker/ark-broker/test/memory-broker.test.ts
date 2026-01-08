import { MemoryBroker } from '../src/memory-broker.js';

describe('MemoryBroker', () => {
  let broker: MemoryBroker;

  beforeEach(() => {
    broker = new MemoryBroker();
  });

  describe('addMessage', () => {
    test('should add a single message', () => {
      const item = broker.addMessage('conv1', 'query1', { role: 'user', content: 'Hello' });

      expect(item.sequenceNumber).toBe(1);
      expect(item.data.conversationId).toBe('conv1');
      expect(item.data.queryId).toBe('query1');
      expect(item.data.message).toEqual({ role: 'user', content: 'Hello' });
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    test('should assign sequential sequence numbers', () => {
      const item1 = broker.addMessage('conv1', 'query1', 'message1');
      const item2 = broker.addMessage('conv1', 'query1', 'message2');
      const item3 = broker.addMessage('conv2', 'query2', 'message3');

      expect(item1.sequenceNumber).toBe(1);
      expect(item2.sequenceNumber).toBe(2);
      expect(item3.sequenceNumber).toBe(3);
    });
  });

  describe('addMessages', () => {
    test('should add multiple messages', () => {
      const messages = ['message1', 'message2', 'message3'];
      const items = broker.addMessages('conv1', 'query1', messages);

      expect(items).toHaveLength(3);
      expect(items[0].sequenceNumber).toBe(1);
      expect(items[1].sequenceNumber).toBe(2);
      expect(items[2].sequenceNumber).toBe(3);
    });
  });

  describe('getByConversation', () => {
    test('should return messages for specific conversation', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');
      broker.addMessage('conv1', 'query3', 'message3');

      const conv1Messages = broker.getByConversation('conv1');

      expect(conv1Messages).toHaveLength(2);
      expect(conv1Messages[0].data.message).toBe('message1');
      expect(conv1Messages[1].data.message).toBe('message3');
    });

    test('should return empty array for non-existent conversation', () => {
      const messages = broker.getByConversation('non-existent');
      expect(messages).toEqual([]);
    });
  });

  describe('getByQuery', () => {
    test('should return messages for specific query', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv1', 'query2', 'message2');
      broker.addMessage('conv2', 'query1', 'message3');

      const query1Messages = broker.getByQuery('query1');

      expect(query1Messages).toHaveLength(2);
      expect(query1Messages[0].data.message).toBe('message1');
      expect(query1Messages[1].data.message).toBe('message3');
    });
  });

  describe('getConversationIds', () => {
    test('should return unique conversation IDs', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');
      broker.addMessage('conv1', 'query3', 'message3');

      const conversationIds = broker.getConversationIds();

      expect(conversationIds).toHaveLength(2);
      expect(conversationIds).toContain('conv1');
      expect(conversationIds).toContain('conv2');
    });
  });

  describe('all', () => {
    test('should return all messages', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');

      const allMessages = broker.all();

      expect(allMessages).toHaveLength(2);
    });
  });

  describe('deleteConversation', () => {
    test('should delete all messages for a conversation', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');
      broker.addMessage('conv1', 'query3', 'message3');

      broker.deleteConversation('conv1');

      const allMessages = broker.all();
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].data.conversationId).toBe('conv2');
    });
  });

  describe('deleteQuery', () => {
    test('should delete messages for specific query in conversation', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv1', 'query2', 'message2');
      broker.addMessage('conv1', 'query1', 'message3');

      broker.deleteQuery('conv1', 'query1');

      const allMessages = broker.all();
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].data.queryId).toBe('query2');
    });
  });

  describe('delete', () => {
    test('should delete all messages when called without predicate', () => {
      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');

      broker.delete();

      expect(broker.all()).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    test('should notify subscriber when message is added', () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribe((item) => {
        received.push(item.data.message);
      });

      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv1', 'query1', 'message2');

      expect(received).toEqual(['message1', 'message2']);

      unsubscribe();
    });

    test('should stop notifying after unsubscribe', () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribe((item) => {
        received.push(item.data.message);
      });

      broker.addMessage('conv1', 'query1', 'message1');
      unsubscribe();
      broker.addMessage('conv1', 'query1', 'message2');

      expect(received).toEqual(['message1']);
    });
  });

  describe('subscribeToConversation', () => {
    test('should only notify for messages in specific conversation', () => {
      const received: unknown[] = [];
      const unsubscribe = broker.subscribeToConversation('conv1', (item) => {
        received.push(item.data.message);
      });

      broker.addMessage('conv1', 'query1', 'message1');
      broker.addMessage('conv2', 'query2', 'message2');
      broker.addMessage('conv1', 'query3', 'message3');

      expect(received).toEqual(['message1', 'message3']);

      unsubscribe();
    });
  });
});
