import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  A2A_TASKS_FEATURE_KEY,
  CHAT_STREAMING_FEATURE_KEY,
  isA2ATasksEnabledAtom,
  storedIsA2ATasksEnabledAtom,
  storedIsChatStreamingEnabledAtom,
} from '@/atoms/experimental-features';

describe('A2A Tasks Feature Flag Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    localStorage.clear();
  });

  describe('storedIsA2ATasksEnabledAtom', () => {
    it('should default to false when not set', () => {
      const value = store.get(storedIsA2ATasksEnabledAtom);
      expect(value).toBe(false);
    });

    it('should persist value to localStorage', () => {
      store.set(storedIsA2ATasksEnabledAtom, true);
      expect(localStorage.getItem(A2A_TASKS_FEATURE_KEY)).toBe('true');
    });

    it('should read value from localStorage on set', () => {
      store.set(storedIsA2ATasksEnabledAtom, true);
      expect(localStorage.getItem(A2A_TASKS_FEATURE_KEY)).toBe('true');

      const value = store.get(storedIsA2ATasksEnabledAtom);
      expect(value).toBe(true);
    });

    it('should update value when set', () => {
      store.set(storedIsA2ATasksEnabledAtom, true);
      expect(store.get(storedIsA2ATasksEnabledAtom)).toBe(true);

      store.set(storedIsA2ATasksEnabledAtom, false);
      expect(store.get(storedIsA2ATasksEnabledAtom)).toBe(false);
    });
  });

  describe('isA2ATasksEnabledAtom', () => {
    it('should return false when storedIsA2ATasksEnabledAtom is false', () => {
      store.set(storedIsA2ATasksEnabledAtom, false);
      const value = store.get(isA2ATasksEnabledAtom);
      expect(value).toBe(false);
    });

    it('should return true when storedIsA2ATasksEnabledAtom is true', () => {
      store.set(storedIsA2ATasksEnabledAtom, true);
      const value = store.get(isA2ATasksEnabledAtom);
      expect(value).toBe(true);
    });

    it('should be read-only (derived atom)', () => {
      expect(() => {
        // @ts-expect-error derived atoms are read-only
        store.set(isA2ATasksEnabledAtom, true);
      }).toThrow();
    });
  });

  describe('experimental-chat-streaming', () => {
    it('should default to false', () => {
      expect(CHAT_STREAMING_FEATURE_KEY).toBe('experimental-chat-streaming');
      expect(store.get(storedIsChatStreamingEnabledAtom)).toBe(false);
    });

    it('should return true when storedIsChatStreamingEnabledAtom is true', () => {
      store.set(storedIsChatStreamingEnabledAtom, true);
      const value = store.get(storedIsChatStreamingEnabledAtom);
      expect(value).toBe(true);
    });

    it('should be read-only (derived atom)', () => {
      expect(() => {
        // @ts-expect-error derived atoms are read-only
        store.set(isChatStreamingEnabledAtom, true);
      }).toThrow();
    });
  });
});
