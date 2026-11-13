import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDismissibleNotice } from '@/lib/hooks/use-dismissible-notice';

const KEY = 'ark-dashboard:test-notice';

describe('useDismissibleNotice', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is not dismissed when nothing is stored', () => {
    const { result } = renderHook(() => useDismissibleNotice(KEY));

    expect(result.current.dismissed).toBe(false);
  });

  it('is dismissed on the first render when the key is already stored', () => {
    globalThis.localStorage.setItem(KEY, 'true');
    const seen: boolean[] = [];

    renderHook(() => {
      const { dismissed } = useDismissibleNotice(KEY);
      seen.push(dismissed);
      return dismissed;
    });

    expect(seen).toEqual([true]);
  });

  it('persists the dismissal and updates the hook', () => {
    const { result } = renderHook(() => useDismissibleNotice(KEY));

    act(() => result.current.dismiss());

    expect(result.current.dismissed).toBe(true);
    expect(globalThis.localStorage.getItem(KEY)).toBe('true');
  });

  it('keeps the dismissal in memory when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const key = `${KEY}:memory`;
    const { result } = renderHook(() => useDismissibleNotice(key));

    act(() => result.current.dismiss());

    expect(result.current.dismissed).toBe(true);
  });

  it('treats unreadable storage as not dismissed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() =>
      useDismissibleNotice(`${KEY}:unreadable`),
    );

    expect(result.current.dismissed).toBe(false);
  });
});
