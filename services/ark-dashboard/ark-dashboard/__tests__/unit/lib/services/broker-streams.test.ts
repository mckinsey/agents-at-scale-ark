import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BROKER_STREAM_KEYS,
  brokerStreamsService,
} from '@/lib/services/broker-streams';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockFetch(
  handler: (url: string) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input))),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('brokerStreamsService.probeAll', () => {
  it('probes every stream once with limit=1, the memory and no caching', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ items: [], total: 0, hasMore: false }),
    );

    await brokerStreamsService.probeAll('my-memory');

    expect(fetchMock).toHaveBeenCalledTimes(BROKER_STREAM_KEYS.length);
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    for (const url of urls) {
      expect(url).toContain('memory=my-memory');
      expect(url).toContain('limit=1');
    }
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit | undefined)?.cache).toBe('no-store');
    }
    expect(urls.some(url => url.includes('/broker/traces'))).toBe(true);
    expect(urls.some(url => url.includes('/broker/messages'))).toBe(true);
    expect(urls.some(url => url.includes('/broker/chunks'))).toBe(true);
    expect(urls.some(url => url.includes('/broker/events'))).toBe(true);
    expect(urls.some(url => url.includes('/broker/sessions'))).toBe(true);
  });

  it('reports empty when every stream returns no items', async () => {
    mockFetch(() => jsonResponse({ items: [], total: 0, hasMore: false }));

    expect(await brokerStreamsService.probeAll('default')).toBe('empty');
  });

  it('reports records when a single stream returns an item', async () => {
    mockFetch(url =>
      url.includes('/broker/events')
        ? jsonResponse({
            items: [{ reason: 'QueryStart' }],
            total: 3,
            hasMore: true,
          })
        : jsonResponse({ items: [], total: 0, hasMore: false }),
    );

    expect(await brokerStreamsService.probeAll('default')).toBe('has-records');
  });

  it('falls back to items length when total is absent', async () => {
    mockFetch(() => jsonResponse({ items: [{ id: 'a' }], hasMore: false }));

    expect(await brokerStreamsService.probeAll('default')).toBe('has-records');
  });

  it('reports records even when another stream is unreadable', async () => {
    mockFetch(url => {
      if (url.includes('/broker/sessions')) {
        return jsonResponse({ error: { message: 'unavailable' } }, false, 503);
      }
      return url.includes('/broker/events')
        ? jsonResponse({ items: [{ id: 'a' }], total: 1, hasMore: false })
        : jsonResponse({ items: [], total: 0, hasMore: false });
    });

    expect(await brokerStreamsService.probeAll('default')).toBe('has-records');
  });

  it('treats an unreadable stream as unknown rather than empty', async () => {
    mockFetch(url =>
      url.includes('/broker/sessions')
        ? jsonResponse({ error: { message: 'unavailable' } }, false, 503)
        : jsonResponse({ items: [], total: 0, hasMore: false }),
    );

    expect(await brokerStreamsService.probeAll('default')).toBe('unknown');
  });

  it('treats a rejected request as unknown rather than empty', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new Error('network down')),
    ) as unknown as typeof fetch;

    expect(await brokerStreamsService.probeAll('default')).toBe('unknown');
  });

  it('treats a malformed payload as unknown rather than empty', async () => {
    mockFetch(() => jsonResponse({ sessions: {} }));

    expect(await brokerStreamsService.probeAll('default')).toBe('unknown');
  });
});
