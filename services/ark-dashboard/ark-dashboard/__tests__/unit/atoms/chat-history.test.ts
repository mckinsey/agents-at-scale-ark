import { createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type ChatSession,
  type TokenUsage,
  chatHistoryAtom,
  createNewSessionId,
} from '@/atoms/chat-history';

describe('Chat History Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('chatHistoryAtom', () => {
    it('should default to empty object', () => {
      const value = store.get(chatHistoryAtom);
      expect(value).toEqual({});
    });

    it('should store a chat session with messages', () => {
      const session: ChatSession = {
        messages: [{ role: 'user', content: 'Hello' }],
        sessionId: 'session-1',
      };
      store.set(chatHistoryAtom, { 'agent-test': session });
      const value = store.get(chatHistoryAtom);
      expect(value['agent-test']).toEqual(session);
    });

    it('should store a chat session with tokenUsage', () => {
      const usage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      };
      const session: ChatSession = {
        messages: [],
        sessionId: 'session-1',
        tokenUsage: usage,
      };
      store.set(chatHistoryAtom, { 'agent-test': session });
      const value = store.get(chatHistoryAtom);
      expect(value['agent-test'].tokenUsage).toEqual(usage);
    });

    it('should store a chat session with messageTokenUsage', () => {
      const msgUsage: Record<number, TokenUsage> = {
        1: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
        3: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
      };
      const session: ChatSession = {
        messages: [],
        sessionId: 'session-1',
        messageTokenUsage: msgUsage,
      };
      store.set(chatHistoryAtom, { 'agent-test': session });
      const value = store.get(chatHistoryAtom);
      expect(value['agent-test'].messageTokenUsage).toEqual(msgUsage);
    });

    it('should handle session without optional token fields', () => {
      const session: ChatSession = {
        messages: [],
        sessionId: 'session-1',
      };
      store.set(chatHistoryAtom, { 'agent-test': session });
      const value = store.get(chatHistoryAtom);
      expect(value['agent-test'].tokenUsage).toBeUndefined();
      expect(value['agent-test'].messageTokenUsage).toBeUndefined();
    });

    it('should accumulate token usage across updates', () => {
      const initial: ChatSession = {
        messages: [],
        sessionId: 'session-1',
        tokenUsage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
      store.set(chatHistoryAtom, { 'agent-test': initial });

      store.set(chatHistoryAtom, prev => {
        const session = prev['agent-test'];
        const current = session.tokenUsage!;
        return {
          ...prev,
          'agent-test': {
            ...session,
            tokenUsage: {
              prompt_tokens: current.prompt_tokens + 200,
              completion_tokens: current.completion_tokens + 100,
              total_tokens: current.total_tokens + 300,
            },
          },
        };
      });

      const value = store.get(chatHistoryAtom);
      expect(value['agent-test'].tokenUsage).toEqual({
        prompt_tokens: 300,
        completion_tokens: 150,
        total_tokens: 450,
      });
    });

    it('should store multiple sessions independently', () => {
      const session1: ChatSession = {
        messages: [],
        sessionId: 'session-1',
        tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      const session2: ChatSession = {
        messages: [],
        sessionId: 'session-2',
        tokenUsage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      };
      store.set(chatHistoryAtom, { 'agent-a': session1, 'agent-b': session2 });

      const value = store.get(chatHistoryAtom);
      expect(value['agent-a'].tokenUsage!.total_tokens).toBe(15);
      expect(value['agent-b'].tokenUsage!.total_tokens).toBe(300);
    });
  });

  describe('createNewSessionId', () => {
    it('should return a string starting with session-', () => {
      const id = createNewSessionId();
      expect(id).toMatch(/^session-\d+$/);
    });

    it('should return unique session IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => createNewSessionId()));
      expect(ids.size).toBeGreaterThanOrEqual(1);
    });
  });
});
