import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyAppRouterNavigations,
  deferAppRouterLanding,
  getAppRouterMock,
  resetAppRouterMock,
} from '@/__tests__/setup/mock-app-router';

import { resetPendingParams, useUrlState } from './use-url-state';

vi.mock('next/navigation', async () => {
  const { createAppRouterMock } =
    await import('@/__tests__/setup/mock-app-router');
  return createAppRouterMock('/agents');
});

const router = getAppRouterMock();

const setUrl = (query: string) => {
  resetAppRouterMock(query);
  // An unlanded write is remembered per screen, so without this one test's
  // pending URL becomes the next one's starting point.
  resetPendingParams();
};

const lastTarget = () => {
  const calls = router.replace.mock.calls;
  return new URL(String(calls[calls.length - 1][0]), 'http://localhost');
};

const spec = {
  q: { default: '' },
  status: { default: 'All' },
  page: { default: 1, parse: (raw: string) => Number.parseInt(raw, 10) },
} as const;

const sortSpec = {
  sort: { default: 'desc' },
} as const;

const debouncedSpec = {
  q: { default: '', debounceMs: 400 },
  status: { default: 'All' },
} as const;

const pagedDebouncedSpec = {
  q: { default: '', debounceMs: 400 },
  page: { default: 1, parse: (raw: string) => Number.parseInt(raw, 10) },
} as const;

const twoDebouncedSpec = {
  q: { default: '', debounceMs: 400 },
  owner: { default: '', debounceMs: 400 },
} as const;

describe('useUrlState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const target = lastTarget();
    expect(target.searchParams.get('namespace')).toBe('test-ns');
    expect(target.searchParams.get('unrelated')).toBe('keep');
    expect(target.searchParams.get('q')).toBe('alpha');
  });

  it('omits a value equal to its default so a pristine list keeps a clean URL', () => {
    setUrl('namespace=test-ns&q=alpha&status=True');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: '', status: 'All' }));

    const target = lastTarget();
    expect(target.searchParams.has('q')).toBe(false);
    expect(target.searchParams.has('status')).toBe(false);
    expect(target.searchParams.get('namespace')).toBe('test-ns');
  });

  it('resets the page when a filter changes', () => {
    setUrl('namespace=test-ns&page=4');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ status: 'True' }));

    const target = lastTarget();
    expect(target.searchParams.has('page')).toBe(false);
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('keeps the requested page when only the page changes', () => {
    setUrl('namespace=test-ns&status=True');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ page: 4 }));

    const target = lastTarget();
    expect(target.searchParams.get('page')).toBe('4');
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('replaces rather than pushes, so filtering does not fill browser history', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it('writes a router-relative path so the deployment base path survives', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(router.replace.mock.calls[0][0]).toMatch(/^\/agents\?/);
  });

  it('does not navigate when the update leaves the query unchanged', () => {
    setUrl('namespace=test-ns&q=alpha');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: 'alpha' }));

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('drops the query string entirely once nothing is left to carry', () => {
    setUrl('q=alpha');

    const { result } = renderHook(() => useUrlState(spec));
    act(() => result.current[1]({ q: '' }));

    expect(router.replace).toHaveBeenCalledWith('/agents', { scroll: false });
  });

  it('ignores keys the spec does not declare', () => {
    const { result } = renderHook(() => useUrlState(spec));
    act(() =>
      result.current[1]({ q: 'alpha', nope: 'x' } as Partial<{
        q: string;
        nope: string;
      }>),
    );

    const target = lastTarget();
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

    const target = lastTarget();
    expect(target.searchParams.has('offset')).toBe(false);
  });

  it('composes two writes issued in the same commit instead of losing the first', () => {
    const { result } = renderHook(() => useUrlState(spec));

    act(() => {
      result.current[1]({ q: 'alpha' });
      result.current[1]({ status: 'True' });
    });

    const target = lastTarget();
    expect(target.searchParams.get('q')).toBe('alpha');
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('composes writes from two instances on one screen while the first is in flight', () => {
    setUrl('pageSize=10');
    deferAppRouterLanding();

    const { result } = renderHook(() => ({
      screen: useUrlState(spec),
      sorting: useUrlState(sortSpec),
    }));

    act(() => result.current.sorting[1]({ sort: 'asc' }));
    act(() => result.current.screen[1]({ page: 2 }));

    const target = lastTarget();
    expect(target.searchParams.get('sort')).toBe('asc');
    expect(target.searchParams.get('page')).toBe('2');
    expect(target.searchParams.get('pageSize')).toBe('10');
  });

  it('rebases on the landed URL once a write arrives', () => {
    deferAppRouterLanding();
    const { result } = renderHook(() => useUrlState(spec));

    act(() => result.current[1]({ q: 'alpha' }));
    act(() => applyAppRouterNavigations());
    act(() => result.current[1]({ status: 'True' }));

    const target = lastTarget();
    expect(target.searchParams.get('q')).toBe('alpha');
    expect(target.searchParams.get('status')).toBe('True');
  });

  it('holds a debounced key until its delay elapses, then writes once', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'a' }));
    act(() => result.current[1]({ q: 'al' }));
    act(() => result.current[1]({ q: 'alpha' }));
    expect(router.replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(lastTarget().searchParams.get('q')).toBe('alpha');
  });

  it('flushes two debounced keys as a single write', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlState(twoDebouncedSpec));

    act(() => result.current[1]({ q: 'alpha' }));
    act(() => result.current[1]({ owner: 'me' }));

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(router.replace).toHaveBeenCalledTimes(1);
    const target = lastTarget();
    expect(target.searchParams.get('q')).toBe('alpha');
    expect(target.searchParams.get('owner')).toBe('me');
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

    act(() => setUrl('q=gamma'));
    rerender();

    expect(result.current[0].q).toBe('gamma');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('writes at once when flush is requested, carrying any draft with it', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'alpha' }));
    act(() => result.current[1]({ status: 'True' }, { flush: true }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const target = lastTarget();
    expect(target.searchParams.get('status')).toBe('True');
    expect(target.searchParams.get('q')).toBe('alpha');
  });

  it('resets the page when a page change carries a live search draft', () => {
    vi.useFakeTimers();
    setUrl('page=2');
    const { result } = renderHook(() => useUrlState(pagedDebouncedSpec));

    act(() => result.current[1]({ q: 'seed' }));
    act(() => result.current[1]({ page: 3 }));

    const target = lastTarget();
    expect(target.searchParams.get('q')).toBe('seed');
    expect(target.searchParams.has('page')).toBe(false);
  });

  it('resets the page when a debounced filter lands on its own', () => {
    vi.useFakeTimers();
    setUrl('page=4');
    const { result } = renderHook(() => useUrlState(pagedDebouncedSpec));

    act(() => result.current[1]({ q: 'seed' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const target = lastTarget();
    expect(target.searchParams.get('q')).toBe('seed');
    expect(target.searchParams.has('page')).toBe(false);
  });

  it('does not write a draft that was still pending when the screen unmounted', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useUrlState(debouncedSpec));

    act(() => result.current[1]({ q: 'alpha' }));
    unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(router.replace).not.toHaveBeenCalled();
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
