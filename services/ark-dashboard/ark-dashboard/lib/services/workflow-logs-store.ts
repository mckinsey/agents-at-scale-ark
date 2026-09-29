import { APIError } from '@/lib/api/client';
import {
  WORKFLOW_LOG_MAX_BUFFERED_LINES,
  WORKFLOW_LOG_PAGE_LINES,
} from '@/lib/constants/workflow-logs';

import { type LogWindowTarget, fetchNodeLogWindow } from './workflow-logs';

export interface NodeLogBuffer {
  lines: string[];
  loaded: boolean;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  truncated: boolean;
  oldestSkipLines: number;
  oldestTimestamp: string | null;
  lastTimestamp: string | null;
  error: string | null;
}

export const MAX_CACHED_BUFFERS = 20;

const EMPTY_BUFFER: NodeLogBuffer = {
  lines: [],
  loaded: false,
  loadingInitial: false,
  loadingOlder: false,
  hasMoreBefore: false,
  truncated: false,
  oldestSkipLines: 0,
  oldestTimestamp: null,
  lastTimestamp: null,
  error: null,
};

export interface NodeLogScrollState {
  scrollTop: number;
  stickToBottom: boolean;
}

const buffers = new Map<string, NodeLogBuffer>();
const scrollStates = new Map<string, NodeLogScrollState>();
const listeners = new Map<string, Set<() => void>>();
const fetchInFlight = new Set<string>();
const pollInFlight = new Set<string>();

export function logBufferKey(target: LogWindowTarget): string {
  return [
    target.namespace,
    target.workflowName,
    target.nodeId,
    target.container ?? 'main',
  ].join('/');
}

export function getNodeLogBuffer(key: string): NodeLogBuffer {
  return buffers.get(key) ?? EMPTY_BUFFER;
}

export function getServerNodeLogBuffer(): NodeLogBuffer {
  return EMPTY_BUFFER;
}

function notify(key: string) {
  listeners.get(key)?.forEach(listener => listener());
}

function update(key: string, patch: Partial<NodeLogBuffer>) {
  buffers.set(key, { ...getNodeLogBuffer(key), ...patch });
  notify(key);
}

function splitContent(content: string): string[] {
  return content ? content.split('\n') : [];
}

function evictLeastRecentlyUsed() {
  if (buffers.size <= MAX_CACHED_BUFFERS) return;

  for (const key of buffers.keys()) {
    if (buffers.size <= MAX_CACHED_BUFFERS) return;
    if (
      !listeners.has(key) &&
      !fetchInFlight.has(key) &&
      !pollInFlight.has(key)
    ) {
      buffers.delete(key);
      scrollStates.delete(key);
    }
  }
}

export function subscribeToNodeLogs(
  key: string,
  listener: () => void,
): () => void {
  const existing = listeners.get(key) ?? new Set<() => void>();
  existing.add(listener);
  listeners.set(key, existing);

  const buffer = buffers.get(key);
  if (buffer) {
    buffers.delete(key);
    buffers.set(key, buffer);
  }

  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(key);
      evictLeastRecentlyUsed();
    }
  };
}

function describeError(error: unknown): string {
  if (error instanceof APIError && error.status === 404) {
    return error.message || 'Logs are no longer available for this node';
  }
  if (error instanceof APIError && error.status === 403) {
    return 'You do not have permission to read these logs';
  }
  return 'Failed to load logs';
}

export async function ensureLoaded(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (buffer?.loaded || fetchInFlight.has(key)) return;

  fetchInFlight.add(key);
  update(key, { loadingInitial: true, error: null });

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
    });

    update(key, {
      lines: splitContent(window.content),
      loaded: true,
      loadingInitial: false,
      hasMoreBefore: window.has_more_before,
      truncated: window.truncated,
      oldestSkipLines: window.line_count,
      oldestTimestamp: window.first_timestamp ?? null,
      lastTimestamp: window.last_timestamp ?? null,
      error: null,
    });
  } catch (error) {
    update(key, { loadingInitial: false, error: describeError(error) });
  } finally {
    fetchInFlight.delete(key);
  }
}

export async function loadOlder(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (!buffer?.loaded || !buffer.hasMoreBefore || fetchInFlight.has(key))
    return;

  fetchInFlight.add(key);
  update(key, { loadingOlder: true });

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
      skipTailLines: buffer.oldestSkipLines,
      beforeTimestamp: buffer.oldestTimestamp ?? undefined,
    });
    const current = getNodeLogBuffer(key);

    update(key, {
      lines: [...splitContent(window.content), ...current.lines],
      loadingOlder: false,
      hasMoreBefore: window.has_more_before,
      truncated: current.truncated || window.truncated,
      oldestSkipLines: current.oldestSkipLines + window.line_count,
      oldestTimestamp: window.first_timestamp ?? current.oldestTimestamp,
      error: null,
    });
  } catch (error) {
    update(key, { loadingOlder: false, error: describeError(error) });
  } finally {
    fetchInFlight.delete(key);
  }
}

function appendTail(
  current: NodeLogBuffer,
  appended: string[],
  window: { last_timestamp?: string | null; truncated: boolean },
): Partial<NodeLogBuffer> {
  const lines = [...current.lines, ...appended];
  const overflow = lines.length - WORKFLOW_LOG_MAX_BUFFERED_LINES;
  const patch: Partial<NodeLogBuffer> = {
    lines,
    lastTimestamp: window.last_timestamp ?? current.lastTimestamp,
    truncated: current.truncated || window.truncated,
    oldestSkipLines: current.oldestSkipLines + appended.length,
    error: null,
  };

  if (overflow <= 0) return patch;

  patch.lines = lines.slice(overflow);
  patch.oldestSkipLines = Math.max(
    0,
    current.oldestSkipLines + appended.length - overflow,
  );
  patch.oldestTimestamp = null;
  patch.hasMoreBefore = true;
  return patch;
}

export async function pollTail(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (!buffer?.loaded || pollInFlight.has(key)) return;
  if (!buffer.lastTimestamp && buffer.lines.length > 0) return;

  pollInFlight.add(key);

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
      sinceTimestamp: buffer.lastTimestamp ?? undefined,
    });

    if (!window.content) return;

    const current = getNodeLogBuffer(key);
    const appended = splitContent(window.content);

    if (!current.lastTimestamp && current.lines.length === 0) {
      update(key, {
        lines: appended,
        hasMoreBefore: window.has_more_before,
        truncated: window.truncated,
        oldestSkipLines: window.line_count,
        oldestTimestamp: window.first_timestamp ?? null,
        lastTimestamp: window.last_timestamp ?? null,
        error: null,
      });
      return;
    }

    update(key, appendTail(current, appended, window));
  } catch (error) {
    update(key, { error: describeError(error) });
  } finally {
    pollInFlight.delete(key);
  }
}

export function getNodeLogScrollState(
  key: string,
): NodeLogScrollState | undefined {
  return scrollStates.get(key);
}

export function setNodeLogScrollState(
  key: string,
  state: NodeLogScrollState,
): void {
  scrollStates.set(key, state);
}

export function resetNodeLogStore(): void {
  buffers.clear();
  scrollStates.clear();
  listeners.clear();
  fetchInFlight.clear();
  pollInFlight.clear();
}
