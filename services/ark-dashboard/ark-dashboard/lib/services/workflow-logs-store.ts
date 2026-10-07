import { APIError } from '@/lib/api/client';
import {
  DEFAULT_LOG_CONTAINER,
  WORKFLOW_LOG_MAX_BUFFERED_LINES,
  WORKFLOW_LOG_PAGE_LINES,
} from '@/lib/constants/workflow-logs';

import { type LogWindowTarget, fetchNodeLogWindow } from './workflow-logs';

// One fetched page's worth of lines. The trim drops whole segments so the
// oldest remaining segment's firstTimestamp is an exact before_timestamp
// cursor for the oldest line still held — the client has no per-line
// timestamps, so a window boundary is the finest cursor it can keep.
interface LogSegment {
  firstTimestamp: string | null;
  lineCount: number;
}

export interface NodeLogBuffer {
  lines: string[];
  segments: LogSegment[];
  loaded: boolean;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreBefore: boolean;
  truncated: boolean;
  oldestSkipLines: number;
  oldestTimestamp: string | null;
  lastTimestamp: string | null;
  error: string | null;
  retryable: boolean;
}

export const MAX_CACHED_BUFFERS = 20;

const EMPTY_BUFFER: NodeLogBuffer = {
  lines: [],
  segments: [],
  loaded: false,
  loadingInitial: false,
  loadingOlder: false,
  hasMoreBefore: false,
  truncated: false,
  oldestSkipLines: 0,
  oldestTimestamp: null,
  lastTimestamp: null,
  error: null,
  retryable: false,
};

function makeSegment(
  firstTimestamp: string | null | undefined,
  lineCount: number,
): LogSegment[] {
  return lineCount > 0
    ? [{ firstTimestamp: firstTimestamp ?? null, lineCount }]
    : [];
}

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
    target.container ?? DEFAULT_LOG_CONTAINER,
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

// Whether a failed load is worth retrying automatically. Permanent client
// errors (bad container, forbidden) can never succeed by repeating, so they are
// terminal; transient failures (pod still initializing, server/network) are not.
function isRetryable(error: unknown): boolean {
  if (error instanceof APIError && error.status !== undefined) {
    const { status } = error;
    return status === 404 || status === 408 || status === 429 || status >= 500;
  }
  return true;
}

export async function ensureLoaded(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if ((buffer?.loaded && !buffer.error) || fetchInFlight.has(key)) return;

  fetchInFlight.add(key);
  update(key, { loadingInitial: true });

  try {
    const window = await fetchNodeLogWindow(target, {
      maxLines: WORKFLOW_LOG_PAGE_LINES,
    });

    const lines = splitContent(window.content);
    update(key, {
      lines,
      segments: makeSegment(window.first_timestamp, lines.length),
      loaded: true,
      loadingInitial: false,
      hasMoreBefore: window.has_more_before,
      truncated: window.truncated,
      oldestSkipLines: window.line_count,
      oldestTimestamp: window.first_timestamp ?? null,
      lastTimestamp: window.last_timestamp ?? null,
      error: null,
      retryable: false,
    });
  } catch (error) {
    update(key, {
      loadingInitial: false,
      error: describeError(error),
      retryable: isRetryable(error),
    });
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
    const older = splitContent(window.content);

    update(key, {
      lines: [...older, ...current.lines],
      segments: [
        ...makeSegment(window.first_timestamp, older.length),
        ...current.segments,
      ],
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
  window: {
    first_timestamp?: string | null;
    last_timestamp?: string | null;
    truncated: boolean;
  },
  deferTrim: boolean,
): Partial<NodeLogBuffer> {
  const lines = [...current.lines, ...appended];
  const segments = [
    ...current.segments,
    ...makeSegment(window.first_timestamp, appended.length),
  ];
  const patch: Partial<NodeLogBuffer> = {
    lines,
    segments,
    lastTimestamp: window.last_timestamp ?? current.lastTimestamp,
    truncated: current.truncated || window.truncated,
    oldestSkipLines: current.oldestSkipLines + appended.length,
    error: null,
  };

  // Trimming the front drops the line loadOlder is paging from. Defer it while
  // an older-page fetch is in flight so that fetch keeps a valid cursor; the
  // next poll trims once it completes.
  if (lines.length <= WORKFLOW_LOG_MAX_BUFFERED_LINES || deferTrim)
    return patch;

  // Drop whole oldest segments so the oldest line still held is exactly the
  // first line of the oldest remaining segment. Its firstTimestamp is then an
  // exact before_timestamp cursor, so loadOlder pages back the trimmed region
  // rather than skipping it.
  const kept = [...segments];
  let dropped = 0;
  while (
    kept.length > 1 &&
    lines.length - dropped > WORKFLOW_LOG_MAX_BUFFERED_LINES
  ) {
    dropped += kept[0].lineCount;
    kept.shift();
  }

  patch.lines = lines.slice(dropped);
  patch.segments = kept;
  patch.oldestSkipLines = Math.max(
    0,
    current.oldestSkipLines + appended.length - dropped,
  );
  patch.oldestTimestamp = kept[0]?.firstTimestamp ?? current.oldestTimestamp;
  patch.hasMoreBefore = true;
  return patch;
}

export async function pollTail(
  key: string,
  target: LogWindowTarget,
): Promise<void> {
  const buffer = buffers.get(key);
  if (!buffer?.loaded || pollInFlight.has(key) || fetchInFlight.has(key))
    return;
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
        segments: makeSegment(window.first_timestamp, appended.length),
        hasMoreBefore: window.has_more_before,
        truncated: window.truncated,
        oldestSkipLines: window.line_count,
        oldestTimestamp: window.first_timestamp ?? null,
        lastTimestamp: window.last_timestamp ?? null,
        error: null,
      });
      return;
    }

    update(key, appendTail(current, appended, window, fetchInFlight.has(key)));
  } catch (error) {
    update(key, { error: describeError(error), retryable: isRetryable(error) });
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
