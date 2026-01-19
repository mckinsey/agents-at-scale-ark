import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_STREAMING_FEATURE_KEY,
  isChatStreamingEnabledAtom,
  storedIsChatStreamingEnabledAtom,
} from '@/atoms/experimental-features';

describe('Experimental Features', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    localStorage.clear();
  });

  describe('experimental-chat-streaming', () => {
    it('should default to true', () => {
      expect(CHAT_STREAMING_FEATURE_KEY).toBe('experimental-chat-streaming');
      expect(store.get(storedIsChatStreamingEnabledAtom)).toBe(true);
    });

    it('should return false when storedIsChatStreamingEnabledAtom is false', () => {
      store.set(storedIsChatStreamingEnabledAtom, false);
      const value = store.get(storedIsChatStreamingEnabledAtom);
      expect(value).toBe(false);
    });

    it('should be read-only (derived atom)', () => {
      expect(() => {
        // @ts-expect-error derived atoms are read-only
        store.set(isChatStreamingEnabledAtom, true);
      }).toThrow();
    });
  });
});
