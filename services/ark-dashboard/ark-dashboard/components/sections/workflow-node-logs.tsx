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
import { useStickyScroll } from '@/lib/hooks/use-sticky-scroll';
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
  const {
    scrollContainerRef,
    messagesEndRef,
    handleScroll: trackStickToBottom,
    scrollToBottom,
    isStickingToBottom,
    setStickToBottom,
  } = useStickyScroll();
  const restoreScrollTopRef = useRef<number | undefined>(undefined);
  const restoreOffsetRef = useRef<number | null>(null);
  const lineCountRef = useRef(0);
  const wasRunningRef = useRef(isRunning);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  });

  const subscribe = useCallback(
    (listener: () => void) => subscribeToNodeLogs(key, listener),
    [key],
  );
  const buffer = useSyncExternalStore(
    subscribe,
    () => getNodeLogBuffer(key),
    getServerNodeLogBuffer,
  );
  const content = useMemo(() => buffer.lines.join('\n'), [buffer.lines]);

  useEffect(() => {
    void ensureLoaded(key, targetRef.current);
  }, [key]);

  useEffect(() => {
    if (!isRunning || buffer.loaded || !buffer.error) return;

    const intervalId = setInterval(() => {
      void ensureLoaded(key, targetRef.current);
    }, WORKFLOW_LOG_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isRunning, buffer.loaded, buffer.error, key]);

  const retryLoad = useCallback(() => {
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
    const container = scrollContainerRef.current;
    if (!container) return;

    setNodeLogScrollState(key, {
      scrollTop: container.scrollTop,
      stickToBottom: isStickingToBottom(),
    });
  }, [key, isStickingToBottom, scrollContainerRef]);

  const requestOlder = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      restoreOffsetRef.current = container.scrollHeight - container.scrollTop;
    }
    void loadOlder(key, targetRef.current);
  }, [key, scrollContainerRef]);

  useLayoutEffect(() => {
    const savedScrollState = getNodeLogScrollState(key);
    setStickToBottom(savedScrollState?.stickToBottom ?? true);
    restoreScrollTopRef.current =
      savedScrollState && !savedScrollState.stickToBottom
        ? savedScrollState.scrollTop
        : undefined;
    restoreOffsetRef.current = null;
    lineCountRef.current = 0;
  }, [key, setStickToBottom]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const previousLineCount = lineCountRef.current;
    lineCountRef.current = buffer.lines.length;

    const restoreOffset = restoreOffsetRef.current;
    if (restoreOffset !== null) {
      if (!buffer.loadingOlder) restoreOffsetRef.current = null;
      container.scrollTop = container.scrollHeight - restoreOffset;
      rememberScroll();
      return;
    }

    const restoreScrollTop = restoreScrollTopRef.current;
    if (restoreScrollTop !== undefined && buffer.lines.length > 0) {
      restoreScrollTopRef.current = undefined;
      container.scrollTop = restoreScrollTop;
      return;
    }

    if (previousLineCount === 0) {
      setStickToBottom(true);
    }
    scrollToBottom();
    rememberScroll();

    if (
      container.scrollHeight <= container.clientHeight &&
      buffer.hasMoreBefore &&
      !buffer.loadingOlder
    ) {
      requestOlder();
    }
  }, [
    buffer.lines,
    buffer.hasMoreBefore,
    buffer.loadingOlder,
    rememberScroll,
    requestOlder,
    scrollContainerRef,
    scrollToBottom,
    setStickToBottom,
  ]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    trackStickToBottom();
    rememberScroll();

    if (
      container.scrollTop <= SCROLL_TOP_THRESHOLD_PX &&
      buffer.hasMoreBefore &&
      !buffer.loadingOlder
    ) {
      requestOlder();
    }
  }, [
    buffer.hasMoreBefore,
    buffer.loadingOlder,
    rememberScroll,
    requestOlder,
    scrollContainerRef,
    trackStickToBottom,
  ]);

  if (buffer.error && buffer.lines.length === 0) {
    return (
      <div className="bg-fill-onsurface-ui-1 flex w-full flex-col items-start gap-2 p-2">
        <p className="paragraph-small-primary text-fg-warning">
          {buffer.error}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={retryLoad}
            disabled={buffer.loadingInitial}>
            Retry
          </Button>
          <Button variant="ghost" size="xs" asChild>
            <a href={argoUrl} target="_blank" rel="noopener noreferrer">
              View logs in Argo UI
              <IconShell size="sm">
                <OpenInNew />
              </IconShell>
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div
        ref={scrollContainerRef}
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

            {!buffer.hasMoreBefore && buffer.lines.length > 0 && (
              <span className="paragraph-small-primary text-fg-tertiary px-1">
                Start of log
              </span>
            )}

            <pre className="paragraph-regular-primary text-fg-secondary whitespace-pre">
              {buffer.lines.length === 0 ? 'No logs available' : content}
            </pre>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {buffer.truncated && (
        <span className="paragraph-small-primary text-fg-tertiary">
          Some lines were dropped because a page hit the size limit.
        </span>
      )}
      {buffer.error && buffer.lines.length > 0 && (
        <span className="paragraph-small-primary text-fg-warning">
          {buffer.error}
        </span>
      )}
    </div>
  );
}
