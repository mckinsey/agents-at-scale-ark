import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@/lib/api/client';
import { WORKFLOW_LOG_MAX_BUFFERED_LINES } from '@/lib/constants/workflow-logs';
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
    expect(buffer.lines).toEqual(['a', 'b']);
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
    expect(buffer.lines).toEqual(['a', 'b', 'c', 'd']);
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
    expect(buffer.lines).toEqual(['a', 'b']);
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

    expect(getNodeLogBuffer(key).lines).toEqual(['a']);

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

  it('surfaces the server explanation when the logs are gone', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(
      new APIError('Pod has been deleted', 404),
    );

    await ensureLoaded(key, target);

    expect(getNodeLogBuffer(key).error).toBe('Pod has been deleted');
  });

  it('reports a permission error rather than a missing-logs hint on 403', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(
      new APIError('forbidden', 403),
    );

    await ensureLoaded(key, target);

    expect(getNodeLogBuffer(key).error).toBe(
      'You do not have permission to read these logs',
    );
  });

  it('reports a generic message for other failures', async () => {
    vi.mocked(fetchNodeLogWindow).mockRejectedValue(new APIError('boom', 500));

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
    expect(failed.lines).toEqual(['c', 'd']);
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
    expect(retried.lines).toEqual(['a', 'b', 'c', 'd']);
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
    expect(failed.lines).toEqual(['a']);
    expect(failed.error).toBe('Failed to load logs');
    expect(failed.lastTimestamp).toBe('t1');

    await pollTail(key, target);

    const recovered = getNodeLogBuffer(key);
    expect(vi.mocked(fetchNodeLogWindow).mock.calls[2][1]).toMatchObject({
      sinceTimestamp: 't1',
    });
    expect(recovered.lines).toEqual(['a', 'b']);
    expect(recovered.lastTimestamp).toBe('t2');
    expect(recovered.error).toBeNull();
  });

  it('fills an empty buffer with the fresh tail when polling without a cursor', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('', { last_timestamp: null }))
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
    expect(buffer.lines).toEqual(['b', 'c']);
    expect(buffer.oldestSkipLines).toBe(2);
    expect(buffer.oldestTimestamp).toBe('t2');
    expect(buffer.lastTimestamp).toBe('t3');
    expect(buffer.hasMoreBefore).toBe(true);
    expect(buffer.truncated).toBe(true);
    expect(buffer.error).toBeNull();
  });

  it('does not re-request a cursor-less tail over content it already holds', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValueOnce(
      windowOf('a', { has_more_before: true, last_timestamp: null }),
    );

    await ensureLoaded(key, target);
    await pollTail(key, target);

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    const buffer = getNodeLogBuffer(key);
    expect(buffer.lines).toEqual(['a']);
    expect(buffer.oldestSkipLines).toBe(1);
  });

  it('advances the paging cursor by the lines a poll appends', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('a\nb', { has_more_before: true, last_timestamp: 't2' }),
      )
      .mockResolvedValueOnce(windowOf('c\nd', { last_timestamp: 't4' }))
      .mockResolvedValueOnce(windowOf('x', { has_more_before: true }));

    await ensureLoaded(key, target);
    await pollTail(key, target);

    expect(getNodeLogBuffer(key).oldestSkipLines).toBe(4);

    await loadOlder(key, target);

    expect(vi.mocked(fetchNodeLogWindow).mock.calls[2][1]).toMatchObject({
      skipTailLines: 4,
    });
  });

  // Fills a buffer past the cap from several poll windows, then trims. The
  // windows are large so the trim crosses a window boundary.
  async function fillPastCapInWindows(): Promise<void> {
    const block = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, index) => `${prefix}-${index}`).join('\n');
    const pageSize = Math.ceil(WORKFLOW_LOG_MAX_BUFFERED_LINES / 4);
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf(block('init', 1000), {
          has_more_before: true,
          first_timestamp: 't-init',
          last_timestamp: 'l-init',
        }),
      )
      .mockResolvedValueOnce(
        windowOf(block('p0', pageSize), { first_timestamp: 'tp0' }),
      )
      .mockResolvedValueOnce(
        windowOf(block('p1', pageSize), { first_timestamp: 'tp1' }),
      )
      .mockResolvedValueOnce(
        windowOf(block('p2', pageSize), { first_timestamp: 'tp2' }),
      )
      .mockResolvedValueOnce(
        windowOf(block('p3', pageSize), { first_timestamp: 'tp3' }),
      );

    await ensureLoaded(key, target);
    await pollTail(key, target);
    await pollTail(key, target);
    await pollTail(key, target);
    await pollTail(key, target);
  }

  it('drops whole oldest windows and anchors the cursor to the oldest remaining window', async () => {
    await fillPastCapInWindows();

    const buffer = getNodeLogBuffer(key);
    expect(buffer.lines.length).toBeLessThanOrEqual(
      WORKFLOW_LOG_MAX_BUFFERED_LINES,
    );
    // the whole 'init' window was dropped; the oldest held line is now p0's first
    expect(buffer.lines[0]).toBe('p0-0');
    // exact first_timestamp of the oldest window still fully held
    expect(buffer.oldestTimestamp).toBe('tp0');
    expect(buffer.hasMoreBefore).toBe(true);
  });

  it('pages the trimmed region back using the window-boundary timestamp', async () => {
    await fillPastCapInWindows();
    vi.mocked(fetchNodeLogWindow).mockResolvedValueOnce(
      windowOf('older-1\nolder-2', {
        has_more_before: true,
        first_timestamp: 't-older',
      }),
    );

    await loadOlder(key, target);

    // loadOlder sends the oldest remaining window's timestamp, so the trimmed
    // region is reachable — not the dropped oldest-ever line's timestamp.
    const olderCall = vi.mocked(fetchNodeLogWindow).mock.calls[5][1];
    expect(olderCall).toMatchObject({ beforeTimestamp: 'tp0' });

    const buffer = getNodeLogBuffer(key);
    expect(buffer.lines.slice(0, 2)).toEqual(['older-1', 'older-2']);
    expect(buffer.oldestTimestamp).toBe('t-older');
  });

  it('defers the trim while an older-page fetch is in flight', async () => {
    const head = Array.from(
      { length: WORKFLOW_LOG_MAX_BUFFERED_LINES },
      (_, index) => `line-${index}`,
    ).join('\n');
    let resolvePoll: (window: ReturnType<typeof windowOf>) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf(head, {
          has_more_before: true,
          first_timestamp: 't0',
          last_timestamp: 't1',
        }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolvePoll = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));

    await ensureLoaded(key, target);

    // Poll starts first (past its guard, awaiting), then an older-page fetch
    // takes the fetch lock while the poll is still in flight.
    const poll = pollTail(key, target);
    const older = loadOlder(key, target);

    resolvePoll(windowOf('new-1\nnew-2', { last_timestamp: 't2' }));
    await poll;

    const buffer = getNodeLogBuffer(key);
    // Trim deferred: buffer temporarily exceeds the cap and the front is intact.
    expect(buffer.lines.length).toBe(WORKFLOW_LOG_MAX_BUFFERED_LINES + 2);
    expect(buffer.lines[0]).toBe('line-0');
    expect(buffer.oldestTimestamp).toBe('t0');
    void older;
  });

  it('refetches when retrying a buffer that loaded empty and then errored', async () => {
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(windowOf('', { last_timestamp: null }))
      .mockRejectedValueOnce(new APIError('Pod has been deleted', 404))
      .mockResolvedValueOnce(windowOf('recovered', { last_timestamp: 't9' }));

    await ensureLoaded(key, target);
    await pollTail(key, target);

    const errored = getNodeLogBuffer(key);
    expect(errored.loaded).toBe(true);
    expect(errored.lines).toEqual([]);
    expect(errored.error).toBe('Pod has been deleted');

    // ensureLoaded used to bail here because loaded is true; it must refetch.
    await ensureLoaded(key, target);

    const recovered = getNodeLogBuffer(key);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(3);
    expect(recovered.lines).toEqual(['recovered']);
    expect(recovered.error).toBeNull();
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
    expect(getNodeLogBuffer(key).lines).toEqual(['a']);
  });

  it('defers the tail poll while an older page is still in flight', async () => {
    let resolveOlder: (window: ReturnType<typeof windowOf>) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('c', { has_more_before: true, last_timestamp: 't3' }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveOlder = resolve;
        }),
      )
      .mockResolvedValueOnce(windowOf('d', { last_timestamp: 't4' }));

    await ensureLoaded(key, target);
    const older = loadOlder(key, target);
    await pollTail(key, target);
    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(2);

    resolveOlder(windowOf('b', { has_more_before: false }));
    await older;

    expect(getNodeLogBuffer(key).lines).toEqual(['b', 'c']);

    await pollTail(key, target);
    expect(getNodeLogBuffer(key).lines).toEqual(['b', 'c', 'd']);
  });

  it('runs a user page request while a poll is in flight', async () => {
    let resolvePoll: (window: ReturnType<typeof windowOf>) => void = () => {};
    vi.mocked(fetchNodeLogWindow)
      .mockResolvedValueOnce(
        windowOf('c', { has_more_before: true, last_timestamp: 't3' }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolvePoll = resolve;
        }),
      )
      .mockResolvedValueOnce(windowOf('b', { has_more_before: false }));

    await ensureLoaded(key, target);
    const poll = pollTail(key, target);
    await loadOlder(key, target);

    expect(fetchNodeLogWindow).toHaveBeenCalledTimes(3);
    expect(getNodeLogBuffer(key).lines).toEqual(['b', 'c']);

    resolvePoll(windowOf('d', { last_timestamp: 't4' }));
    await poll;

    expect(getNodeLogBuffer(key).lines).toEqual(['b', 'c', 'd']);
  });
  it('evicts the least recently used buffer and its scroll state past the cache limit', async () => {
    vi.mocked(fetchNodeLogWindow).mockResolvedValue(windowOf('a'));

    const [oldest] = await loadRange(0, 1);
    setNodeLogScrollState(oldest, { scrollTop: 10, stickToBottom: false });
    const keys = await loadRange(1, MAX_CACHED_BUFFERS + 1);
    const newest = keys[keys.length - 1];

    expect(getNodeLogBuffer(oldest).loaded).toBe(false);
    expect(getNodeLogBuffer(oldest).lines).toEqual([]);
    expect(getNodeLogScrollState(oldest)).toBeUndefined();
    expect(getNodeLogBuffer(newest).loaded).toBe(true);
    expect(getNodeLogBuffer(newest).lines).toEqual(['a']);
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
    expect(getNodeLogBuffer(pending).lines).toEqual(['pending']);
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
