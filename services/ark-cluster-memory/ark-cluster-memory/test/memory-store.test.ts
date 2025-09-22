import { MemoryStore } from '../src/memory-store.js';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe('Session Management', () => {
    test('should add message to session', () => {
      store.addMessage('test-session', { content: 'Hello, world!' });
      
      const messages = store.getMessages('test-session');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ content: 'Hello, world!' });
    });

    test('should add multiple messages to session', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];
      
      store.addMessages('test-session', messages);
      
      const retrieved = store.getMessages('test-session');
      expect(retrieved).toHaveLength(2);
      expect(retrieved).toEqual(messages);
    });

    test('should return empty array for non-existent session', () => {
      const messages = store.getMessages('non-existent');
      expect(messages).toEqual([]);
    });

    test('should validate session ID', () => {
      expect(() => store.addMessage('', 'message')).toThrow('Session ID cannot be empty');
    });

    test('should track multiple sessions independently', () => {
      store.addMessage('session1', 'message1');
      store.addMessage('session2', 'message2');
      
      expect(store.getMessages('session1')).toEqual(['message1']);
      expect(store.getMessages('session2')).toEqual(['message2']);
    });
  });

  describe('Message Validation', () => {
    test('should validate message size', () => {
      const smallStore = new MemoryStore(100); // 100 byte limit
      const largeMessage = 'x'.repeat(200);

      expect(() => smallStore.addMessage('test', largeMessage)).toThrow('Message exceeds maximum size');
    });

    test('should use MAX_MESSAGE_SIZE_MB env var when set', () => {
      const originalEnv = process.env.MAX_MESSAGE_SIZE_MB;
      process.env.MAX_MESSAGE_SIZE_MB = '1'; // 1MB limit

      const envStore = new MemoryStore();
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

      const defaultStore = new MemoryStore();
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

  describe('Stats and Health', () => {
    test('should return service stats', () => {
      store.addMessage('session1', 'message1');
      store.addMessage('session1', 'message2');
      store.addMessage('session2', 'message3');
      
      const stats = store.getStats();
      
      expect(stats.sessions).toBe(2);
      expect(stats.totalMessages).toBe(3);
    });

    test('should report healthy status', () => {
      expect(store.isHealthy()).toBe(true);
    });
  });
});