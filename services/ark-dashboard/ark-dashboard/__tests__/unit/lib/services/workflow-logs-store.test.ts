import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchNodeLogWindow } from '@/lib/services/workflow-logs';
import {
  ensureLoaded,
  getNodeLogBuffer,
  loadOlder,
  logBufferKey,
  pollTail,
  resetNodeLogStore,
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
});
