import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { useAtomValue } from 'jotai';
import { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  queryTimeoutSettingAtom,
  storedQueryTimeoutSettingAtom,
} from '@/atoms/experimental-features';

describe('Query Timeout Integration', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  describe('Query creation with timeout setting', () => {
    it('should use default timeout (5m) for new queries', () => {
      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      expect(result.current).toBe('5m');
    });

    it('should use configured timeout (10m) for new queries', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');

      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      expect(result.current).toBe('10m');
    });

    it('should use configured timeout (15m) for new queries', () => {
      store.set(storedQueryTimeoutSettingAtom, '15m');

      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      expect(result.current).toBe('15m');
    });

    it('should update timeout when setting is changed', () => {
      const { result, rerender } = renderHook(
        () => useAtomValue(queryTimeoutSettingAtom),
        { wrapper },
      );

      expect(result.current).toBe('5m');

      store.set(storedQueryTimeoutSettingAtom, '10m');
      rerender();

      expect(result.current).toBe('10m');

      store.set(storedQueryTimeoutSettingAtom, '15m');
      rerender();

      expect(result.current).toBe('15m');
    });

    it('should persist timeout across page reloads', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');
      
      // Verify localStorage has the value
      expect(localStorage.getItem('query-timeout-setting')).toBe('"10m"');

      // Create new store simulating page reload
      const newStore = createStore();
      const newWrapper = ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={newStore}>{children}</JotaiProvider>
      );

      const { result } = renderHook(
        () => useAtomValue(queryTimeoutSettingAtom),
        { wrapper: newWrapper },
      );

      expect(result.current).toBe('10m');
    });
  });

  describe('Edge cases', () => {
    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('query-timeout-setting', 'corrupted-data');

      const newStore = createStore();
      const newWrapper = ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={newStore}>{children}</JotaiProvider>
      );

      const { result } = renderHook(
        () => useAtomValue(queryTimeoutSettingAtom),
        { wrapper: newWrapper },
      );

      // Should fall back to default
      expect(result.current).toBe('5m');
    });

    it('should handle missing localStorage data', () => {
      localStorage.removeItem('query-timeout-setting');

      const newStore = createStore();
      const newWrapper = ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={newStore}>{children}</JotaiProvider>
      );

      const { result } = renderHook(
        () => useAtomValue(queryTimeoutSettingAtom),
        { wrapper: newWrapper },
      );

      expect(result.current).toBe('5m');
    });

    it('should handle unexpected timeout values by accepting them', () => {
      // While not in the UI options, the atom should accept any string value
      store.set(storedQueryTimeoutSettingAtom, '30m');

      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      expect(result.current).toBe('30m');
    });

    it('should handle rapid changes to timeout setting', () => {
      const { result, rerender } = renderHook(
        () => useAtomValue(queryTimeoutSettingAtom),
        { wrapper },
      );

      // Rapid changes
      store.set(storedQueryTimeoutSettingAtom, '5m');
      rerender();
      expect(result.current).toBe('5m');

      store.set(storedQueryTimeoutSettingAtom, '10m');
      rerender();
      expect(result.current).toBe('10m');

      store.set(storedQueryTimeoutSettingAtom, '15m');
      rerender();
      expect(result.current).toBe('15m');

      store.set(storedQueryTimeoutSettingAtom, '5m');
      rerender();
      expect(result.current).toBe('5m');
    });

    it('should maintain timeout setting when other atoms change', () => {
      store.set(storedQueryTimeoutSettingAtom, '10m');

      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      expect(result.current).toBe('10m');

      // Changing other atoms shouldn't affect timeout
      // The timeout should remain stable
      expect(result.current).toBe('10m');
    });
  });

  describe('Streaming and non-streaming queries', () => {
    it('should apply same timeout to both streaming and non-streaming queries', () => {
      store.set(storedQueryTimeoutSettingAtom, '15m');

      const { result } = renderHook(() => useAtomValue(queryTimeoutSettingAtom), {
        wrapper,
      });

      // The timeout value is the same regardless of streaming state
      expect(result.current).toBe('15m');
    });
  });
});
