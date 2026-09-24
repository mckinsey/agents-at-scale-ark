'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import { OpenInNew } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Spinner } from '@/components/ui/spinner';
import { WORKFLOW_LOG_POLL_INTERVAL_MS } from '@/lib/constants/workflow-logs';
import type { LogWindowTarget } from '@/lib/services/workflow-logs';
import {
  ensureLoaded,
  getNodeLogBuffer,
  getNodeLogScrollState,
  getServerNodeLogBuffer,
  loadOlder,
  logBufferKey,
  pollTail,
  setNodeLogScrollState,
  subscribeToNodeLogs,
} from '@/lib/services/workflow-logs-store';

const SCROLL_TOP_THRESHOLD_PX = 200;
const STICK_TO_BOTTOM_THRESHOLD_PX = 40;

interface WorkflowNodeLogsProps {
  readonly target: LogWindowTarget;
  readonly isRunning: boolean;
  readonly argoUrl: string;
}

export function WorkflowNodeLogs({
  target,
  isRunning,
  argoUrl,
}: WorkflowNodeLogsProps) {
  const key = useMemo(() => logBufferKey(target), [target]);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const savedScrollState = getNodeLogScrollState(key);
  const restoreScrollTopRef = useRef(
    savedScrollState && !savedScrollState.stickToBottom
      ? savedScrollState.scrollTop
      : undefined,
  );
  const restoreOffsetRef = useRef<number | null>(null);
  const pageCountRef = useRef(0);
  const wasRunningRef = useRef(isRunning);
  const targetRef = useRef(target);
  targetRef.current = target;

  const subscribe = useCallback(
    (listener: () => void) => subscribeToNodeLogs(key, listener),
    [key],
  );
  const buffer = useSyncExternalStore(
    subscribe,
    () => getNodeLogBuffer(key),
    getServerNodeLogBuffer,
  );

  useEffect(() => {
    void ensureLoaded(key, targetRef.current);
  }, [key]);

  useEffect(() => {
    if (!isRunning || !buffer.loaded) return;

    const intervalId = setInterval(() => {
      void pollTail(key, targetRef.current);
    }, WORKFLOW_LOG_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isRunning, buffer.loaded, key]);

  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;

    if (!wasRunning || isRunning || !buffer.loaded) return;
    void pollTail(key, targetRef.current);
  }, [isRunning, buffer.loaded, key]);

  const rememberScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    setNodeLogScrollState(key, {
      scrollTop: container.scrollTop,
      stickToBottom: stickToBottomRef.current,
    });
  }, [key]);

  const requestOlder = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      restoreOffsetRef.current = container.scrollHeight - container.scrollTop;
    }
    void loadOlder(key, targetRef.current);
  }, [key]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousPageCount = pageCountRef.current;
    pageCountRef.current = buffer.pages.length;

    const restoreOffset = restoreOffsetRef.current;
    if (restoreOffset !== null) {
      restoreOffsetRef.current = null;
      container.scrollTop = container.scrollHeight - restoreOffset;
      rememberScroll();
      return;
    }

    const restoreScrollTop = restoreScrollTopRef.current;
    if (restoreScrollTop !== undefined && buffer.pages.length > 0) {
      restoreScrollTopRef.current = undefined;
      container.scrollTop = restoreScrollTop;
      return;
    }

    if (previousPageCount === 0 || stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      rememberScroll();
    }

    if (
      container.scrollHeight <= container.clientHeight &&
      buffer.hasMoreBefore &&
      !buffer.loadingOlder
    ) {
      requestOlder();
    }
  }, [
    buffer.pages,
    buffer.hasMoreBefore,
    buffer.loadingOlder,
    rememberScroll,
    requestOlder,
  ]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    stickToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      STICK_TO_BOTTOM_THRESHOLD_PX;
    rememberScroll();

    if (
      container.scrollTop <= SCROLL_TOP_THRESHOLD_PX &&
      buffer.hasMoreBefore &&
      !buffer.loadingOlder
    ) {
      requestOlder();
    }
  }, [buffer.hasMoreBefore, buffer.loadingOlder, rememberScroll, requestOlder]);

  if (buffer.error && buffer.pages.length === 0) {
    return (
      <div className="bg-fill-onsurface-ui-1 flex w-full flex-col items-start gap-2 p-2">
        <p className="paragraph-small-primary text-fg-warning">
          {buffer.error}
        </p>
        <Button variant="ghost" size="xs" asChild>
          <a href={argoUrl} target="_blank" rel="noopener noreferrer">
            View logs in Argo UI
            <IconShell size="sm">
              <OpenInNew />
            </IconShell>
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        data-testid="workflow-node-logs-scroll"
        className="bg-fill-onsurface-ui-1 h-96 w-full overflow-auto p-2">
        {buffer.loadingInitial && (
          <div className="flex items-center gap-2">
            <Spinner size="sm" className="text-fg-tertiary" />
            <span className="paragraph-small-primary text-fg-tertiary">
              Loading logs...
            </span>
          </div>
        )}

        {buffer.loaded && (
          <div className="flex w-max min-w-full flex-col">
            {buffer.loadingOlder && (
              <span className="paragraph-small-primary text-fg-tertiary px-1">
                Loading older logs...
              </span>
            )}

            {!buffer.hasMoreBefore && buffer.pages.length > 0 && (
              <span className="paragraph-small-primary text-fg-tertiary px-1">
                Start of log
              </span>
            )}

            {buffer.pages.length === 0 && (
              <pre className="paragraph-regular-primary text-fg-secondary whitespace-pre">
                No logs available
              </pre>
            )}

            {buffer.pages.map((page, index) => (
              <pre
                key={`${key}-page-${index}-${page.length}`}
                className="paragraph-regular-primary text-fg-secondary whitespace-pre">
                {page}
              </pre>
            ))}
          </div>
        )}
      </div>

      {buffer.truncated && (
        <span className="paragraph-small-primary text-fg-tertiary">
          Some lines were dropped because a page hit the size limit.
        </span>
      )}
      {buffer.error && buffer.pages.length > 0 && (
        <span className="paragraph-small-primary text-fg-warning">
          {buffer.error}
        </span>
      )}
    </div>
  );
}
