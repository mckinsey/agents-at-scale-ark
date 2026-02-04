import { createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  experimentalFeaturesDialogOpenAtom,
  filesBrowserPrefixAtom,
  lastConversationIdAtom,
} from '@/atoms/internal-states';

describe('Internal States Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('experimentalFeaturesDialogOpenAtom', () => {
    it('should default to false', () => {
      const value = store.get(experimentalFeaturesDialogOpenAtom);
      expect(value).toBe(false);
    });

    it('should be updatable to true', () => {
      store.set(experimentalFeaturesDialogOpenAtom, true);
      const value = store.get(experimentalFeaturesDialogOpenAtom);
      expect(value).toBe(true);
    });

    it('should be updatable back to false', () => {
      store.set(experimentalFeaturesDialogOpenAtom, true);
      expect(store.get(experimentalFeaturesDialogOpenAtom)).toBe(true);

      store.set(experimentalFeaturesDialogOpenAtom, false);
      expect(store.get(experimentalFeaturesDialogOpenAtom)).toBe(false);
    });
  });

  describe('filesBrowserPrefixAtom', () => {
    it('should default to empty string', () => {
      const value = store.get(filesBrowserPrefixAtom);
      expect(value).toBe('');
    });

    it('should be updatable to a directory path', () => {
      store.set(filesBrowserPrefixAtom, 'documents/reports/');
      const value = store.get(filesBrowserPrefixAtom);
      expect(value).toBe('documents/reports/');
    });

    it('should be updatable back to root', () => {
      store.set(filesBrowserPrefixAtom, 'documents/');
      expect(store.get(filesBrowserPrefixAtom)).toBe('documents/');

      store.set(filesBrowserPrefixAtom, '');
      expect(store.get(filesBrowserPrefixAtom)).toBe('');
    });

    it('should persist value across store recreations (page refresh)', () => {
      store.set(filesBrowserPrefixAtom, 'documents/reports/');
      expect(store.get(filesBrowserPrefixAtom)).toBe('documents/reports/');

      const newStore = createStore();
      const valueAfterRefresh = newStore.get(filesBrowserPrefixAtom);
      expect(valueAfterRefresh).toBe('documents/reports/');
    });
  });

  describe('lastConversationIdAtom', () => {
    it('should default to null', () => {
      const value = store.get(lastConversationIdAtom);
      expect(value).toBe(null);
    });

    it('should be updatable to a conversation ID', () => {
      store.set(lastConversationIdAtom, 'conv-123');
      const value = store.get(lastConversationIdAtom);
      expect(value).toBe('conv-123');
    });

    it('should be updatable back to null', () => {
      store.set(lastConversationIdAtom, 'conv-123');
      expect(store.get(lastConversationIdAtom)).toBe('conv-123');

      store.set(lastConversationIdAtom, null);
      expect(store.get(lastConversationIdAtom)).toBe(null);
    });

    it('should persist value across store recreations (page refresh)', () => {
      store.set(lastConversationIdAtom, 'conv-456');
      expect(store.get(lastConversationIdAtom)).toBe('conv-456');

      const newStore = createStore();
      const valueAfterRefresh = newStore.get(lastConversationIdAtom);
      expect(valueAfterRefresh).toBe('conv-456');
    });
  });
});
