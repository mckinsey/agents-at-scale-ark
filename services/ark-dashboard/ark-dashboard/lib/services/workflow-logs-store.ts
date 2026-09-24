import { WORKFLOW_LOG_PAGE_LINES } from '@/lib/constants/workflow-logs';

import { type LogWindowTarget, fetchNodeLogWindow } from './workflow-logs';

export interface NodeLogBuffer {
  pages: string[];
  loaded: boolean;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  truncated: boolean;
  oldestSkipLines: number;
  lastTimestamp: string | null;
  error: string | null;
}

const MAX_CACHED_BUFFERS = 20;

const EMPTY_BUFFER: NodeLogBuffer = {
  pages: [],
  loaded: false,
  loadingInitial: false,
  loadingOlder: false,
  hasMoreBefore: false,
  truncated: false,
  oldestSkipLines: 0,
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
const inFlight = new Set<string>();

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

function evictLeastRecentlyUsed() {
  if (buffers.size <= MAX_CACHED_BUFFERS) return;

  for (const key of buffers.keys()) {
    if (buffers.size <= MAX_CACHED_BUFFERS) return;
    if (!listeners.has(key) && !inFlight.has(key)) {
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
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('404')
    ? 'Logs not available (pod terminated and logs not archived)'
    : 'Failed to load logs';
}

export async function ensureLoaded(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (buffer?.loaded || inFlight.has(key)) return;

  inFlight.add(key);
  update(key, { loadingInitial: true, error: null });

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
    });

    update(key, {
      pages: window.content ? [window.content] : [],
      loaded: true,
      loadingInitial: false,
      hasMoreBefore: window.has_more_before,
      truncated: window.truncated,
      oldestSkipLines: window.line_count,
      lastTimestamp: window.last_timestamp ?? null,
      error: null,
    });
  } catch (error) {
    update(key, { loadingInitial: false, error: describeError(error) });
  } finally {
    inFlight.delete(key);
  }
}

export async function loadOlder(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (!buffer?.loaded || !buffer.hasMoreBefore || inFlight.has(key)) return;

  inFlight.add(key);
  update(key, { loadingOlder: true });

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
      skipTailLines: buffer.oldestSkipLines,
    });
    const current = getNodeLogBuffer(key);

    update(key, {
      pages: window.content
        ? [window.content, ...current.pages]
        : current.pages,
      loadingOlder: false,
      hasMoreBefore: window.has_more_before,
      truncated: current.truncated || window.truncated,
      oldestSkipLines: current.oldestSkipLines + window.line_count,
      error: null,
    });
  } catch (error) {
    update(key, { loadingOlder: false, error: describeError(error) });
  } finally {
    inFlight.delete(key);
  }
}

export async function pollTail(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (!buffer?.loaded || inFlight.has(key)) return;

  inFlight.add(key);

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
      sinceTimestamp: buffer.lastTimestamp ?? undefined,
    });

    if (!window.content) return;

    const current = getNodeLogBuffer(key);

    if (!buffer.lastTimestamp) {
      update(key, {
        pages: [window.content],
        hasMoreBefore: window.has_more_before,
        truncated: window.truncated,
        oldestSkipLines: window.line_count,
        lastTimestamp: window.last_timestamp ?? null,
        error: null,
      });
      return;
    }

    update(key, {
      pages: [...current.pages, window.content],
      lastTimestamp: window.last_timestamp ?? current.lastTimestamp,
      truncated: current.truncated || window.truncated,
      error: null,
    });
  } catch (error) {
    update(key, { error: describeError(error) });
  } finally {
    inFlight.delete(key);
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
  inFlight.clear();
}
