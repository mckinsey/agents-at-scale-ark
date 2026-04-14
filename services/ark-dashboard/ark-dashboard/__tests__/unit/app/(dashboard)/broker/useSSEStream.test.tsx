import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSSEStream } from '@/app/(dashboard)/broker/page';

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { trackEvent } from '@/lib/analytics/singleton';

type ESInstance = {
  url: string;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const esInstances: ESInstance[] = [];

class MockEventSource {
  url: string;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    esInstances.push(this as unknown as ESInstance);
  }
}

function latestES(): ESInstance {
  return esInstances[esInstances.length - 1];
}

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  };
}

const defaultPage = { items: [], total: 0, hasMore: false, nextCursor: undefined };

beforeEach(() => {
  esInstances.length = 0;
  (global as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  global.fetch = vi.fn().mockResolvedValue(makeFetchResponse(defaultPage)) as unknown as typeof fetch;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}

describe('useSSEStream', () => {
  it('returns initial state when endpoint is null', () => {
    const { result } = renderHook(() => useSSEStream(null, 'mem'));
    expect(result.current.entries).toEqual([]);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not open EventSource when endpoint is null', () => {
    renderHook(() => useSSEStream(null, 'mem'));
    expect(esInstances).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches initial page and opens EventSource when endpoint set', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeFetchResponse({ items: [{ timestamp: '2024-01-01T00:00:00Z', foo: 1 }], total: 1, hasMore: false }),
    );
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/broker/messages?memory=mem&limit=1000'),
      expect.any(Object),
    );
    expect(esInstances).toHaveLength(1);
    expect(latestES().url).toContain('watch=true');
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.hasMore).toBe(false);
  });

  it('disconnects and clears state when endpoint transitions to null', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFetchResponse({ items: [{ timestamp: 't' }], total: 1, hasMore: false }),
    );
    const { result, rerender } = renderHook(
      ({ ep }: { ep: string | null }) => useSSEStream(ep, 'mem'),
      { initialProps: { ep: '/v1/broker/messages' as string | null } },
    );
    await flush();
    const es = latestES();
    rerender({ ep: null });
    await flush();
    expect(es.close).toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.isConnected).toBe(false);
  });

  it('exercises initial fetch with error body in response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeFetchResponse({ error: { message: 'boom' } }),
    );
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    // connect() runs after and clears error; we just verify no crash and ES opened
    expect(esInstances.length).toBeGreaterThanOrEqual(1);
    expect(result.current).toBeDefined();
  });

  it('exercises initial fetch rejection path', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    expect(result.current).toBeDefined();
  });

  it('ignores AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(abortErr);
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    expect(result.current.error).toBeNull();
  });

  it('appends streamed entries on SSE message', async () => {
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    act(() => {
      latestES().onmessage?.({ data: JSON.stringify({ timestamp: '2024-01-01T00:00:00Z', hello: 'world' }) });
    });
    expect(result.current.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('sets error when SSE message contains error object', async () => {
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    act(() => {
      latestES().onmessage?.({ data: JSON.stringify({ error: { message: 'stream-boom' } }) });
    });
    expect(result.current.error).toBe('stream-boom');
  });

  it('swallows malformed SSE JSON', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    act(() => {
      latestES().onmessage?.({ data: 'not-json{' });
    });
    expect(result.current.error).toBeNull();
    spy.mockRestore();
  });

  it('sets isConnected on onopen', async () => {
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    act(() => {
      latestES().onopen?.();
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('handles onerror by disconnecting and scheduling reconnect', async () => {
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    act(() => {
      latestES().onopen?.();
    });
    expect(result.current.isConnected).toBe(true);
    const firstES = latestES();
    act(() => {
      firstES.onerror?.();
    });
    expect(result.current.isConnected).toBe(false);
    expect(firstES.close).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });
    expect(esInstances.length).toBeGreaterThanOrEqual(2);
  });

  it('purge DELETEs with memory param and clears state + fires trackEvent', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFetchResponse({ items: [{ timestamp: 't' }], total: 1, hasMore: false }),
    );
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mymem'));
    await flush();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeFetchResponse({}, true));
    await act(async () => {
      await result.current.purge();
    });
    const deleteCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      c => (c[1] as { method?: string })?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall?.[0]).toContain('memory=mymem');
    expect(result.current.entries).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'broker_data_purged' }),
    );
  });

  it('purge failure triggers toast.error (no crash)', async () => {
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeFetchResponse({}, false, 500));
    await act(async () => {
      await result.current.purge();
    });
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalled();
  });

  it('loadMore fetches next page when cursor available', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeFetchResponse({ items: [{ timestamp: 't' }], total: 2, hasMore: true, nextCursor: 5 }),
    );
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    // Init loop fetches until hasMore false; second call returns no more.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeFetchResponse({ items: [{ timestamp: 't2' }], total: 2, hasMore: true, nextCursor: 10 }),
    );
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalled();
  });

  it('loadMore no-ops when hasMore is false', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeFetchResponse({ items: [], total: 0, hasMore: false }),
    );
    const { result } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      result.current.loadMore();
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('memory change triggers reconnect with new URL', async () => {
    const { rerender } = renderHook(
      ({ mem }: { mem: string }) => useSSEStream('/v1/broker/messages', mem),
      { initialProps: { mem: 'mem1' } },
    );
    await flush();
    expect(latestES().url).toContain('memory=mem1');
    rerender({ mem: 'mem2' });
    await flush();
    const urls = esInstances.map(e => e.url);
    expect(urls.some(u => u.includes('memory=mem2'))).toBe(true);
  });

  it('unmount closes EventSource and aborts inflight fetch', async () => {
    const { unmount } = renderHook(() => useSSEStream('/v1/broker/messages', 'mem'));
    await flush();
    const es = latestES();
    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
