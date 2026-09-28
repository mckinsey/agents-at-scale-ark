import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchNodeLogWindow } from '@/lib/services/workflow-logs';
import {
  MAX_CACHED_BUFFERS,
  ensureLoaded,
  getNodeLogBuffer,
  getNodeLogScrollState,
  loadOlder,
  logBufferKey,
  pollTail,
  resetNodeLogStore,
  setNodeLogScrollState,
  subscribeToNodeLogs,
} from '@/lib/services/workflow-logs-store';

vi.mock('@/lib/services/workflow-logs', () => ({
  fetchNodeLogWindow: vi.fn(),
}));

const target = {
  namespace: 'test-namespace',
  workflowName: 'wf-1',
  nodeId: 'node-1',
};

const key = logBufferKey(target);

function windowOf(
  content: string,
  overrides: Partial<{
    has_more_before: boolean;
    truncated: boolean;
    first_timestamp: string | null;
    last_timestamp: string | null;
  }> = {},
) {
  const lines = content ? content.split('\n') : [];
  return {
    content,
    line_count: lines.length,
    byte_count: content.length,
    has_more_before: false,
    truncated: false,
    first_timestamp: null,
    last_timestamp: null,
    ...overrides,
  };
}

function targetOf(index: number) {
  return { ...target, nodeId: `node-${index}` };
}

async function loadWhileSubscribed(index: number): Promise<string> {
  const nodeTarget = targetOf(index);
  const nodeKey = logBufferKey(nodeTarget);
  const unsubscribe = subscribeToNodeLogs(nodeKey, () => {});
  await ensureLoaded(nodeKey, nodeTarget);
  unsubscribe();
  return nodeKey;
}

async function loadRange(from: number, to: number): Promise<string[]> {
  const keys: string[] = [];
  for (let index = from; index < to; index++) {
    keys.push(await loadWhileSubscribed(index));
  }
  return keys;
}

describe('workflow log store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNodeLogStore();
  });

  it('loads the tail page once and records the paging cursor', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(
      windowOf('a\nb', { has_more_before: true, last_timestamp: 't2' }),
    );

    await ensureLoaded(key, target);
    await ensureLoaded(key, target);

    const buffer = getNodeLogBuffer(key);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    expect(buffer.pages).toEqual(['a\nb']);
    expect(buffer.oldestSkipLines).toBe(2);
    expect(buffer.hasMoreBefore).toBe(true);
    expect(buffer.lastTimestamp).toBe('t2');
  });

  it('prepends older pages and advances the skip cursor', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('c\nd', { has_more_before: true }))
      .mockResolvedValueOnce(windowOf('a\nb', { has_more_before: false }));

    await ensureLoaded(key, target);
    await loadOlder(key, target);

    const buffer = getNodeLogBuffer(key);
    expect(buffer.pages).toEqual(['a\nb', 'c\nd']);
    expect(buffer.oldestSkipLines).toBe(4);
    expect(buffer.hasMoreBefore).toBe(false);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      skipTailLines: 2,
    });
  });

  it('sends the oldest timestamp as the before cursor when paging older', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('c\nd', { has_more_before: true, first_timestamp: 't3' }),
      )
      .mockResolvedValueOnce(
        windowOf('a\nb', { has_more_before: true, first_timestamp: 't1' }),
      );

    await ensureLoaded(key, target);
    await loadOlder(key, target);

    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      beforeTimestamp: 't3',
    });
    expect(getNodeLogBuffer(key).oldestTimestamp).toBe('t1');
  });

  it('does not page past the start of the log', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(
      windowOf('a', { has_more_before: false }),
    );

    await ensureLoaded(key, target);
    await loadOlder(key, target);

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
  });

  it('appends polled lines and advances the timestamp cursor', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a', { last_timestamp: 't1' }))
      .mockResolvedValueOnce(windowOf('b', { last_timestamp: 't2' }));

    await ensureLoaded(key, target);
    await pollTail(key, target);

    const buffer = getNodeLogBuffer(key);
    expect(buffer.pages).toEqual(['a', 'b']);
    expect(buffer.lastTimestamp).toBe('t2');
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[1][1]).toMatchObject({
      sinceTimestamp: 't1',
    });
  });

  it('keeps the buffer when the last subscriber goes away', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(
      windowOf('a', { last_timestamp: 't1' }),
    );

    const unsubscribe = subscribeToNodeLogs(key, () => {});
    await ensureLoaded(key, target);
    unsubscribe();

    expect(getNodeLogBuffer(key).pages).toEqual(['a']);

    subscribeToNodeLogs(key, () => {});
    await ensureLoaded(key, target);

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers when the buffer changes', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));
    const listener = vi.fn();
    subscribeToNodeLogs(key, listener);

    await ensureLoaded(key, target);

    expect(listener).toHaveBeenCalled();
  });

  it('reports a friendly message when the logs are gone', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(new Error('HTTP 404'));

    await ensureLoaded(key, target);

    expect(getNodeLogBuffer(key).error).toBe(
      'Logs not available (pod terminated and logs not archived)',
    );
  });

  it('reports a generic message for non-404 failures', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(new Error('HTTP 500'));

    await ensureLoaded(key, target);

    expect(getNodeLogBuffer(key).error).toBe('Failed to load logs');
  });

  it('keeps loaded pages and the paging cursor when loading older fails', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('c\nd', { has_more_before: true, first_timestamp: 't3' }),
      )
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(windowOf('a\nb', { has_more_before: false }));

    await ensureLoaded(key, target);
    await loadOlder(key, target);

    const failed = getNodeLogBuffer(key);
    expect(failed.pages).toEqual(['c\nd']);
    expect(failed.error).toBe('Failed to load logs');
    expect(failed.loadingOlder).toBe(false);
    expect(failed.hasMoreBefore).toBe(true);
    expect(failed.oldestSkipLines).toBe(2);
    expect(failed.oldestTimestamp).toBe('t3');

    await loadOlder(key, target);

    const retried = getNodeLogBuffer(key);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(3);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[2][1]).toMatchObject({
      skipTailLines: 2,
      beforeTimestamp: 't3',
    });
    expect(retried.pages).toEqual(['a\nb', 'c\nd']);
    expect(retried.error).toBeNull();
    expect(retried.hasMoreBefore).toBe(false);
  });

  it('keeps loaded pages and the timestamp cursor when polling fails', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a', { last_timestamp: 't1' }))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(windowOf('b', { last_timestamp: 't2' }));

    await ensureLoaded(key, target);
    await pollTail(key, target);

    const failed = getNodeLogBuffer(key);
    expect(failed.pages).toEqual(['a']);
    expect(failed.error).toBe('Failed to load logs');
    expect(failed.lastTimestamp).toBe('t1');

    await pollTail(key, target);

    const recovered = getNodeLogBuffer(key);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[2][1]).toMatchObject({
      sinceTimestamp: 't1',
    });
    expect(recovered.pages).toEqual(['a', 'b']);
    expect(recovered.lastTimestamp).toBe('t2');
    expect(recovered.error).toBeNull();
  });

  it('replaces the buffer with the fresh tail when polling without a timestamp cursor', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a', { last_timestamp: null }))
      .mockResolvedValueOnce(
        windowOf('b\nc', {
          has_more_before: true,
          truncated: true,
          first_timestamp: 't2',
          last_timestamp: 't3',
        }),
      );

    await ensureLoaded(key, target);
    await pollTail(key, target);

    const buffer = getNodeLogBuffer(key);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(fetchNodeLogWindow).mock.calls[1][1]?.sinceTimestamp,
    ).toBeUndefined();
    expect(buffer.pages).toEqual(['b\nc']);
    expect(buffer.oldestSkipLines).toBe(2);
    expect(buffer.oldestTimestamp).toBe('t2');
    expect(buffer.lastTimestamp).toBe('t3');
    expect(buffer.hasMoreBefore).toBe(true);
    expect(buffer.truncated).toBe(true);
    expect(buffer.error).toBeNull();
  });

  it('leaves the buffer untouched and stays silent when a poll returns nothing', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('a', { last_timestamp: 't1' }))
      .mockResolvedValueOnce(windowOf('', { last_timestamp: 't1' }));

    await ensureLoaded(key, target);
    const before = structuredClone(getNodeLogBuffer(key));
    const listener = vi.fn();
    subscribeToNodeLogs(key, listener);

    await pollTail(key, target);

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(getNodeLogBuffer(key)).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not poll a buffer that has never been loaded', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    await pollTail(key, target);

    expect(fetchNodeLogWindow).not.toHaveBeenCalled();
  });

  it('skips polling and paging older while the initial load is in flight', async () => {
    let resolveInitial: (
      window: ReturnType<typeof windowOf>,
    ) => void = () => {};
    vi.mocked(fetchNodeLogWindow).mockReturnValueOnce(
      new Promise(resolve => {
        resolveInitial = resolve;
      }),
    );

    const initial = ensureLoaded(key, target);
    await pollTail(key, target);
    await loadOlder(key, target);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

    resolveInitial(
      windowOf('a', { has_more_before: true, last_timestamp: 't1' }),
    );
    await initial;

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    expect(getNodeLogBuffer(key).pages).toEqual(['a']);
  });

  it('skips polling while an older page is in flight', async () => {
    let resolveOlder: (window: ReturnType<typeof windowOf>) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('c', { has_more_before: true, last_timestamp: 't3' }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveOlder = resolve;
        }),
      );

    await ensureLoaded(key, target);
    const older = loadOlder(key, target);
    await pollTail(key, target);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);

    resolveOlder(windowOf('b', { has_more_before: false }));
    await older;

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);
    expect(getNodeLogBuffer(key).pages).toEqual(['b', 'c']);
  });
  it('evicts the least recently used buffer and its scroll state past the cache limit', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const [oldest] = await loadRange(0, 1);
    setNodeLogScrollState(oldest, { scrollTop: 10, stickToBottom: false });
    const keys = await loadRange(1, MAX_CACHED_BUFFERS + 1);
    const newest = keys[keys.length - 1];

    expect(getNodeLogBuffer(oldest).loaded).toBe(false);
    expect(getNodeLogBuffer(oldest).pages).toEqual([]);
    expect(getNodeLogScrollState(oldest)).toBeUndefined();
    expect(getNodeLogBuffer(newest).loaded).toBe(true);
    expect(getNodeLogBuffer(newest).pages).toEqual(['a']);
  });

  it('does not evict a buffer that still has a listener', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const watchedTarget = targetOf(0);
    const watched = logBufferKey(watchedTarget);
    subscribeToNodeLogs(watched, () => {});
    await ensureLoaded(watched, watchedTarget);
    const [secondOldest, third] = await loadRange(1, MAX_CACHED_BUFFERS + 1);

    expect(getNodeLogBuffer(watched).loaded).toBe(true);
    expect(getNodeLogBuffer(secondOldest).loaded).toBe(false);
    expect(getNodeLogBuffer(third).loaded).toBe(true);
  });

  it('does not evict a buffer with a request in flight', async () => {
    let resolvePending: (
      window: ReturnType<typeof windowOf>,
    ) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolvePending = resolve;
        }),
      )
      .mockResolvedValue(windowOf('a'));

    const pendingTarget = targetOf(0);
    const pending = logBufferKey(pendingTarget);
    const initial = ensureLoaded(pending, pendingTarget);
    const [secondOldest] = await loadRange(1, MAX_CACHED_BUFFERS + 1);

    expect(getNodeLogBuffer(pending).loadingInitial).toBe(true);
    expect(getNodeLogBuffer(secondOldest).loaded).toBe(false);

    resolvePending(windowOf('pending'));
    await initial;

    expect(getNodeLogBuffer(pending).loaded).toBe(true);
    expect(getNodeLogBuffer(pending).pages).toEqual(['pending']);
  });

  it('treats a re-subscribed buffer as most recently used', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const [first, second] = await loadRange(0, MAX_CACHED_BUFFERS);
    subscribeToNodeLogs(first, () => {})();
    await loadRange(MAX_CACHED_BUFFERS, MAX_CACHED_BUFFERS + 1);

    expect(getNodeLogBuffer(first).loaded).toBe(true);
    expect(getNodeLogBuffer(second).loaded).toBe(false);
  });

  it('keeps every buffer while the cache is within the limit', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const keys = await loadRange(0, MAX_CACHED_BUFFERS);
    setNodeLogScrollState(keys[0], { scrollTop: 10, stickToBottom: false });
    subscribeToNodeLogs(keys[0], () => {})();

    expect(keys.every(nodeKey => getNodeLogBuffer(nodeKey).loaded)).toBe(true);
    expect(getNodeLogScrollState(keys[0])).toEqual({
      scrollTop: 10,
      stickToBottom: false,
    });
  });
});
