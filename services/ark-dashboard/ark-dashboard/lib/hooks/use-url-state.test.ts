import { act, renderHook } from '@testing-library/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUrlState } from './use-url-state';

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: mockReplace })),
  usePathname: vi.fn(() => '/agents'),
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

const setUrl = (query: string) => {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>,
  );
};

const spec = {
  q: { default: '' },
  status: { default: 'All' },
  page: { default: 1, parse: (raw: string) => Number.parseInt(raw, 10) },
} as const;

const debouncedSpec = {
  q: { default: '', debounceMs: 400 },
  status: { default: 'All' },
} as const;

describe('useUrlState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/agents');
    setUrl('namespace=test-ns');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to the declared defaults when the URL names nothing', () => {
    const { result } = renderHook(() => useUrlState(spec));

    expect(result.current[0]).toEqual({ q: '', status: 'All', page: 1 });
  });

  it('reads values from the URL, applying the parser', () => {
    setUrl('namespace=test-ns&q=alpha&status=True&page=3');

    const { result } = renderHook(() => useUrlState(spec));

    expect(result.current[0]).toEqual({ q: 'alpha', status: 'True', page: 3 });
  });

  it('preserves params it does not own, including the namespace', () => {
    setUrl('namespace=test-ns&unrelated=keep');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.get('namespace')).toBe('test-ns');
    expect(target.searchParams.get('unrelated')).toBe('keep');
    expect(target.searchParams.get('q')).toBe('alpha');
  });

  it('omits a value equal to its default so a pristine list keeps a clean URL', () => {
    setUrl('namespace=test-ns&q=alpha&status=True');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: '', status: 'All' }));

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.has('q')).toBe(false);
    expect(target.searchParams.has('status')).toBe(false);
    expect(target.searchParams.get('namespace')).toBe('test-ns');
  });

  it('resets the page when a filter changes', () => {
    setUrl('namespace=test-ns&page=4');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ status: 'True' }));

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.has('page')).toBe(false);
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('keeps the requested page when only the page changes', () => {
    setUrl('namespace=test-ns&status=True');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ page: 4 }));

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.get('page')).toBe('4');
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('replaces rather than pushes, so filtering does not fill browser history', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it('writes a router-relative path so the deployment base path survives', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(mockReplace.mock.calls[0][0]).toMatch(/^\/agents\?/);
  });

  it('does not navigate when the update leaves the query unchanged', () => {
    setUrl('namespace=test-ns&q=alpha');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('drops the query string entirely once nothing is left to carry', () => {
    setUrl('q=alpha');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: '' }));

    expect(mockReplace).toHaveBeenCalledWith('/agents', { scroll: false });
  });

  it('ignores keys the spec does not declare', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() =>
      result.current[1]({ q: 'alpha', nope: 'x' } as Partial<{
        q: string;
        nope: string;
      }>),
    );

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.has('nope')).toBe(false);
  });

  it('honours a custom page key', () => {
    const customSpec = {
      q: { default: '' },
      offset: { default: 0, parse: (raw: string) => Number.parseInt(raw, 10) },
    } as const;
    setUrl('offset=40');

    const { result } = renderHook(() =>
      useUrlState(customSpec, { pageKey: 'offset' }),
    );
    act(() => result.current[1]({ q: 'alpha' }));

    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.has('offset')).toBe(false);
  });

  it('composes two writes issued in the same commit instead of losing the first', () => {
    const { result } = renderHook(() => useUrlState(spec));

    act(() => {
      result.current[1]({ q: 'alpha' });
      result.current[1]({ status: 'True' });
    });

    const calls = mockReplace.mock.calls;
    const target = new URL(calls[calls.length - 1][0], 'http://localhost');
    expect(target.searchParams.get('q')).toBe('alpha');
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('holds a debounced key until its delay elapses, then writes once', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'a' }));
    act(() => result.current[1]({ q: 'al' }));
    act(() => result.current[1]({ q: 'alpha' }));
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.get('q')).toBe('alpha');
  });

  it('reads a pending draft back immediately while the URL still holds the old value', () => {
    vi.useFakeTimers();
    setUrl('q=alpha');
    const { result } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'beta' }));

    expect(result.current[0].q).toBe('beta');
    expect(result.current[2].q).toBe('alpha');
  });

  it('lets the URL win over a pending draft and does not write the draft back', () => {
    vi.useFakeTimers();
    setUrl('q=alpha');
    const { result, rerender } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'beta' }));
    expect(result.current[0].q).toBe('beta');

    setUrl('q=gamma');
    rerender();

    expect(result.current[0].q).toBe('gamma');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('writes at once when flush is requested, carrying any draft with it', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'alpha' }));
    act(() => result.current[1]({ status: 'True' }, { flush: true }));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const target = new URL(mockReplace.mock.calls[0][0], 'http://localhost');
    expect(target.searchParams.get('status')).toBe('True');
    expect(target.searchParams.get('q')).toBe('alpha');
  });

  it('recomputes when a default supplied by a prop changes', () => {
    setUrl('');
    const { result, rerender } = renderHook(
      ({ direction }: { direction: string }) =>
        useUrlState({ sort: { default: direction } }),
      { initialProps: { direction: 'desc' } },
    );

    expect(result.current[0].sort).toBe('desc');

    rerender({ direction: 'asc' });

    expect(result.current[0].sort).toBe('asc');
  });
});
