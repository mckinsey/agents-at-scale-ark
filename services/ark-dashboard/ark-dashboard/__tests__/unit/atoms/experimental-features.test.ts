import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_STREAMING_FEATURE_KEY,
  QUERY_TIMEOUT_SETTING_KEY,
  isChatStreamingEnabledAtom,
  queryTimeoutSettingAtom,
  storedIsChatStreamingEnabledAtom,
  storedQueryTimeoutSettingAtom,
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

  describe('query-timeout-setting', () => {
    it('should have correct key', () => {
      expect(QUERY_TIMEOUT_SETTING_KEY).toBe('query-timeout-setting');
    });

    it('should default to 5m', () => {
      const value = store.get(storedQueryTimeoutSettingAtom);
      expect(value).toBe('5m');
    });

    it('should allow setting to 10m', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');
      const value = store.get(storedQueryTimeoutSettingAtom);
      expect(value).toBe('10m');
    });

    it('should allow setting to 15m', () => {
      store.set(storedQueryTimeoutSettingAtom, '15m');
      const value = store.get(storedQueryTimeoutSettingAtom);
      expect(value).toBe('15m');
    });

    it('should persist value in localStorage', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');
      expect(localStorage.getItem(QUERY_TIMEOUT_SETTING_KEY)).toBe('"10m"');
    });

    it('should persist and restore value from localStorage', () => {
      // Set value in one store
      store.set(storedQueryTimeoutSettingAtom, '15m');
      expect(localStorage.getItem(QUERY_TIMEOUT_SETTING_KEY)).toBe('"15m"');
      
      // Verify it was stored
      const storedValue = localStorage.getItem(QUERY_TIMEOUT_SETTING_KEY);
      expect(storedValue).toBe('"15m"');
      expect(JSON.parse(storedValue!)).toBe('15m');
    });

    it('should be readable through queryTimeoutSettingAtom', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');
      const value = store.get(queryTimeoutSettingAtom);
      expect(value).toBe('10m');
    });

    it('queryTimeoutSettingAtom should be read-only (derived atom)', () => {
      expect(() => {
        // @ts-expect-error derived atoms are read-only
        store.set(queryTimeoutSettingAtom, '15m');
      }).toThrow();
    });

    it('should handle empty localStorage gracefully', () => {
      localStorage.clear();
      const newStore = createStore();
      const value = newStore.get(storedQueryTimeoutSettingAtom);
      expect(value).toBe('5m');
    });

    it('should handle invalid localStorage value gracefully', () => {
      localStorage.setItem(QUERY_TIMEOUT_SETTING_KEY, 'invalid-json');
      const newStore = createStore();
      const value = newStore.get(storedQueryTimeoutSettingAtom);
      expect(value).toBe('5m');
    });
  });
});
