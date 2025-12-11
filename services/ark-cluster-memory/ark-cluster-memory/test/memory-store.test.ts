import { MemoryStore } from '../src/memory-store.js';

type TestMessage = { content: string } | { role: string; content: string } | string;

describe('MemoryStore', () => {
  let store: MemoryStore<TestMessage>;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('Conversation Management', () => {
    test('should add message to conversation', () => {
      store.addMessage('test-conversation', { content: 'Hello, world!' });

      const messages = store.getMessages('test-conversation');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ content: 'Hello, world!' });
    });

    test('should add multiple messages to conversation', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];

      store.addMessages('test-conversation', messages);

      const retrieved = store.getMessages('test-conversation');
      expect(retrieved).toHaveLength(2);
      expect(retrieved).toEqual(messages);
    });

    test('should return empty array for non-existent conversation', () => {
      const messages = store.getMessages('non-existent');
      expect(messages).toEqual([]);
    });

    test('should validate conversation ID', () => {
      expect(() => store.addMessage('', 'message')).toThrow('Conversation ID cannot be empty');
    });

    test('should track multiple conversations independently', () => {
      store.addMessage('conversation1', 'message1');
      store.addMessage('conversation2', 'message2');

      expect(store.getMessages('conversation1')).toEqual(['message1']);
      expect(store.getMessages('conversation2')).toEqual(['message2']);
    });
  });

  describe('Message Validation', () => {
    test('should validate message size', () => {
      const smallStore = new MemoryStore<TestMessage>(100); // 100 byte limit
      const largeMessage = 'x'.repeat(200);

      expect(() => smallStore.addMessage('test', largeMessage)).toThrow('Message exceeds maximum size');
    });

    test('should use MAX_MESSAGE_SIZE_MB env var when set', () => {
      const originalEnv = process.env.MAX_MESSAGE_SIZE_MB;
      process.env.MAX_MESSAGE_SIZE_MB = '1'; // 1MB limit

      const envStore = new MemoryStore<TestMessage>();
      const largeMessage = 'x'.repeat(2 * 1024 * 1024); // 2MB message

      expect(() => envStore.addMessage('test', largeMessage)).toThrow('Message exceeds maximum size');

      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.MAX_MESSAGE_SIZE_MB;
      } else {
        process.env.MAX_MESSAGE_SIZE_MB = originalEnv;
      }
    });

    test('should use default 10MB when MAX_MESSAGE_SIZE_MB not set', () => {
      const originalEnv = process.env.MAX_MESSAGE_SIZE_MB;
      delete process.env.MAX_MESSAGE_SIZE_MB;

      const defaultStore = new MemoryStore<TestMessage>();
      const nineeMbMessage = 'x'.repeat(9 * 1024 * 1024); // 9MB - should pass
      const elevenMbMessage = 'x'.repeat(11 * 1024 * 1024); // 11MB - should fail

      expect(() => defaultStore.addMessage('test1', nineeMbMessage)).not.toThrow();
      expect(() => defaultStore.addMessage('test2', elevenMbMessage)).toThrow('Message exceeds maximum size');

      // Restore original env
      if (originalEnv !== undefined) {
        process.env.MAX_MESSAGE_SIZE_MB = originalEnv;
      }
    });
  });

  describe('Sequence Numbers', () => {
    test('should assign sequential numbers to messages', () => {
      store.addMessage('test-conversation', { content: 'First message' });
      store.addMessage('test-conversation', { content: 'Second message' });

      const allMessages = store.getAllMessages();
      expect(allMessages).toHaveLength(2);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[1].sequence).toBe(2);
    });

    test('should assign correct sequence numbers for batch messages', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];

      store.addMessages('test-conversation', messages);

      const allMessages = store.getAllMessages();
      expect(allMessages).toHaveLength(2);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[1].sequence).toBe(2);
    });

    test('should assign correct sequence numbers for messages with metadata', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];

      store.addMessagesWithMetadata('test-conversation', 'query1', messages);

      const allMessages = store.getAllMessages();
      expect(allMessages).toHaveLength(2);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[1].sequence).toBe(2);
    });

    test('should maintain sequence order across different conversations', () => {
      store.addMessage('conversation1', { content: 'Message 1' });
      store.addMessage('conversation2', { content: 'Message 2' });
      store.addMessage('conversation1', { content: 'Message 3' });

      const allMessages = store.getAllMessages();
      expect(allMessages).toHaveLength(3);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[1].sequence).toBe(2);
      expect(allMessages[2].sequence).toBe(3);
    });
  });

  describe('Stats and Health', () => {
    test('should return service stats', () => {
      store.addMessage('conversation1', 'message1');
      store.addMessage('conversation1', 'message2');
      store.addMessage('conversation2', 'message3');

      const stats = store.getStats();

      expect(stats.conversations).toBe(2);
      expect(stats.totalMessages).toBe(3);
    });

    test('should report healthy status', () => {
      expect(store.isHealthy()).toBe(true);
    });
  });

  describe('Cleanup - MAX_MEMORY_DB', () => {
    beforeEach(() => {
      const originalEnv = process.env.MAX_MEMORY_DB;
      delete process.env.MAX_MEMORY_DB;
      if (originalEnv !== undefined) {
        process.env.MAX_MEMORY_DB = originalEnv;
      }
    });

    test('should not cleanup when MAX_MEMORY_DB is 0 (unlimited)', () => {
      delete process.env.MAX_MEMORY_DB;
      const unlimitedStore = new MemoryStore<TestMessage>();

      for (let i = 0; i < 100; i++) {
        unlimitedStore.addMessage('conversation1', { content: `Message ${i}` });
      }

      expect(unlimitedStore.getAllMessages()).toHaveLength(100);
    });

    test('should cleanup old messages when MAX_MEMORY_DB limit is reached', () => {
      process.env.MAX_MEMORY_DB = '5';
      const limitedStore = new MemoryStore<TestMessage>();

      for (let i = 0; i < 10; i++) {
        limitedStore.addMessage('conversation1', { content: `Message ${i}` });
      }

      const allMessages = limitedStore.getAllMessages();
      expect(allMessages).toHaveLength(5);
      expect(allMessages[0].message).toEqual({ content: 'Message 5' });
      expect(allMessages[4].message).toEqual({ content: 'Message 9' });
    });

    test('should maintain sequence numbers after cleanup', () => {
      process.env.MAX_MEMORY_DB = '3';
      const limitedStore = new MemoryStore<TestMessage>();

      for (let i = 0; i < 5; i++) {
        limitedStore.addMessage('conversation1', { content: `Message ${i}` });
      }

      const allMessages = limitedStore.getAllMessages();
      expect(allMessages).toHaveLength(3);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[1].sequence).toBe(2);
      expect(allMessages[2].sequence).toBe(3);
    });

    test('should cleanup across multiple conversations when limit reached', () => {
      process.env.MAX_MEMORY_DB = '4';
      const limitedStore = new MemoryStore<TestMessage>();

      limitedStore.addMessage('conversation1', { content: 'Conversation1-Message1' });
      limitedStore.addMessage('conversation2', { content: 'Conversation2-Message1' });
      limitedStore.addMessage('conversation1', { content: 'Conversation1-Message2' });
      limitedStore.addMessage('conversation2', { content: 'Conversation2-Message2' });
      limitedStore.addMessage('conversation1', { content: 'Conversation1-Message3' });

      const allMessages = limitedStore.getAllMessages();
      expect(allMessages).toHaveLength(4);
    });

    test('should cleanup on batch add when limit exceeded', () => {
      process.env.MAX_MEMORY_DB = '3';
      const limitedStore = new MemoryStore<TestMessage>();

      limitedStore.addMessage('conversation1', { content: 'Message1' });
      limitedStore.addMessage('conversation1', { content: 'Message2' });
      limitedStore.addMessages('conversation1', [
        { content: 'Message3' },
        { content: 'Message4' },
        { content: 'Message5' }
      ]);

      const allMessages = limitedStore.getAllMessages();
      expect(allMessages).toHaveLength(3);
    });
  });

  describe('Cleanup - MAX_ITEM_AGE', () => {
    beforeEach(() => {
      const originalEnv = process.env.MAX_ITEM_AGE;
      delete process.env.MAX_ITEM_AGE;
      if (originalEnv !== undefined) {
        process.env.MAX_ITEM_AGE = originalEnv;
      }
    });

    test('should not cleanup when MAX_ITEM_AGE is 0 (no limit)', () => {
      delete process.env.MAX_ITEM_AGE;
      const unlimitedStore = new MemoryStore<TestMessage>();

      unlimitedStore.addMessage('conversation1', { content: 'Message1' });

      expect(unlimitedStore.getAllMessages()).toHaveLength(1);
    });

    test('should cleanup messages older than MAX_ITEM_AGE', () => {
      process.env.MAX_ITEM_AGE = '1';
      const ageLimitedStore = new MemoryStore<TestMessage>();

      ageLimitedStore.addMessage('conversation1', { content: 'Message1' });

      const oldMessage = ageLimitedStore.getAllMessages()[0];
      oldMessage.timestamp = new Date(Date.now() - 2000).toISOString();

      ageLimitedStore.addMessage('conversation1', { content: 'Message2' });

      const allMessages = ageLimitedStore.getAllMessages();
      expect(allMessages).toHaveLength(1);
      expect(allMessages[0].message).toEqual({ content: 'Message2' });
    });

    test('should keep recent messages within age limit', () => {
      process.env.MAX_ITEM_AGE = '10';
      const ageLimitedStore = new MemoryStore<TestMessage>();

      ageLimitedStore.addMessage('conversation1', { content: 'Message1' });
      ageLimitedStore.addMessage('conversation1', { content: 'Message2' });

      const allMessages = ageLimitedStore.getAllMessages();
      expect(allMessages).toHaveLength(2);
    });

    test('should cleanup old messages when adding new messages', () => {
      process.env.MAX_ITEM_AGE = '1';
      const ageLimitedStore = new MemoryStore<TestMessage>();

      ageLimitedStore.addMessage('conversation1', { content: 'Message1' });
      const messages = ageLimitedStore.getAllMessages();
      messages[0].timestamp = new Date(Date.now() - 2000).toISOString();

      ageLimitedStore.addMessage('conversation1', { content: 'Message2' });

      const allMessages = ageLimitedStore.getAllMessages();
      expect(allMessages.length).toBeLessThanOrEqual(1);
      if (allMessages.length > 0) {
        expect(allMessages[0].message).toEqual({ content: 'Message2' });
      }
    });
  });

  describe('Cleanup - Combined MAX_MEMORY_DB and MAX_ITEM_AGE', () => {
    beforeEach(() => {
      const originalMaxDb = process.env.MAX_MEMORY_DB;
      const originalMaxAge = process.env.MAX_ITEM_AGE;
      delete process.env.MAX_MEMORY_DB;
      delete process.env.MAX_ITEM_AGE;
      if (originalMaxDb !== undefined) {
        process.env.MAX_MEMORY_DB = originalMaxDb;
      }
      if (originalMaxAge !== undefined) {
        process.env.MAX_ITEM_AGE = originalMaxAge;
      }
    });

    test('should apply age limit first, then count limit', () => {
      process.env.MAX_ITEM_AGE = '10';
      process.env.MAX_MEMORY_DB = '3';
      const combinedStore = new MemoryStore<{ content: string }>();

      combinedStore.addMessage('conversation1', { content: 'Message1' });
      const oldMessage = combinedStore.getAllMessages()[0];
      oldMessage.timestamp = new Date(Date.now() - 20000).toISOString();

      combinedStore.addMessage('conversation1', { content: 'Message2' });
      combinedStore.addMessage('conversation1', { content: 'Message3' });
      combinedStore.addMessage('conversation1', { content: 'Message4' });

      const allMessages = combinedStore.getAllMessages();
      expect(allMessages.length).toBeLessThanOrEqual(3);
      expect(allMessages.every(msg => msg.message.content !== 'Message1')).toBe(true);
    });

    test('should maintain correct sequence after combined cleanup', () => {
      process.env.MAX_MEMORY_DB = '5';
      process.env.MAX_ITEM_AGE = '100';
      const combinedStore = new MemoryStore<TestMessage>();

      for (let i = 0; i < 8; i++) {
        combinedStore.addMessage('conversation1', { content: `Message ${i}` });
      }

      const allMessages = combinedStore.getAllMessages();
      expect(allMessages).toHaveLength(5);
      expect(allMessages[0].sequence).toBe(1);
      expect(allMessages[4].sequence).toBe(5);
    });
  });

  describe('Cleanup - Edge Cases', () => {
    test('should handle cleanup when no messages exist', () => {
      process.env.MAX_MEMORY_DB = '10';
      const emptyStore = new MemoryStore<TestMessage>();

      expect(emptyStore.getAllMessages()).toHaveLength(0);
      emptyStore.addMessage('conversation1', { content: 'Message1' });
      expect(emptyStore.getAllMessages()).toHaveLength(1);
    });

    test('should handle cleanup when limit equals current count', () => {
      process.env.MAX_MEMORY_DB = '3';
      const store = new MemoryStore<TestMessage>();

      store.addMessage('conversation1', { content: 'Message1' });
      store.addMessage('conversation1', { content: 'Message2' });
      store.addMessage('conversation1', { content: 'Message3' });

      expect(store.getAllMessages()).toHaveLength(3);
      store.addMessage('conversation1', { content: 'Message4' });
      expect(store.getAllMessages()).toHaveLength(3);
    });

    test('should preserve message order after cleanup', () => {
      process.env.MAX_MEMORY_DB = '3';
      const store = new MemoryStore<{
        content: string;
      }>();

      store.addMessage('conversation1', { content: 'Message1' });
      store.addMessage('conversation1', { content: 'Message2' });
      store.addMessage('conversation1', { content: 'Message3' });
      store.addMessage('conversation1', { content: 'Message4' });

      const allMessages = store.getAllMessages();
      expect(allMessages[0].message.content).toBe('Message2');
      expect(allMessages[1].message.content).toBe('Message3');
      expect(allMessages[2].message.content).toBe('Message4');
    });
  });
});