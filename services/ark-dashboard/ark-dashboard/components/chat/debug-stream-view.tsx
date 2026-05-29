'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getSessionDisplayNameFromEntries } from '@/lib/broker/session-utils';

import type { StreamEntry } from '@/lib/utils/sse-stream';

interface DebugStreamViewProps {
  entries: StreamEntry[];
  isConnected: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  error: string | null;
  onLoadMore?: () => void;
}

function unwrapAttrValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.stringValue === 'string') return v.stringValue;
    if (typeof v.intValue === 'string') return v.intValue;
    if (typeof v.intValue === 'number') return String(v.intValue);
    if (typeof v.boolValue === 'boolean') return String(v.boolValue);
    if (typeof v.doubleValue === 'number') return String(v.doubleValue);
  }
  return undefined;
}

function findAttrValue(
  attributes: unknown,
  key: string,
): string | undefined {
  if (!Array.isArray(attributes)) return undefined;
  const attr = attributes.find(
    (a: unknown) =>
      typeof a === 'object' && a !== null && 'key' in a && a.key === key,
  ) as { value?: unknown } | undefined;
  return unwrapAttrValue(attr?.value);
}

function extractSessionId(data: unknown): string {
  const item = data as Record<string, unknown>;

  if (Array.isArray(item.spans)) {
    for (const span of item.spans) {
      if (!span || typeof span !== 'object') continue;
      const fromSpan = findAttrValue(
        (span as Record<string, unknown>).attributes,
        'ark.session.id',
      );
      if (fromSpan) return fromSpan;
    }
  }

  const fromTop = findAttrValue(item.attributes, 'ark.session.id');
  if (fromTop) return fromTop;

  const inner = item.data as Record<string, unknown> | undefined;
  if (inner && typeof inner === 'object') {
    if (typeof inner.sessionId === 'string') return inner.sessionId;
  }

  let ark = item.ark as Record<string, unknown> | undefined;
  if (!ark && inner && typeof inner === 'object') {
    const chunk = inner.chunk as Record<string, unknown> | undefined;
    ark = chunk?.ark as Record<string, unknown> | undefined;
  }
  if (ark) {
    if (typeof ark.session === 'string') return ark.session;
    const completedQuery = ark.completedQuery as
      | Record<string, unknown>
      | undefined;
    const spec = completedQuery?.spec as Record<string, unknown> | undefined;
    if (typeof spec?.sessionId === 'string') return spec.sessionId;
  }

  return 'unknown';
}

export function DebugStreamView({
  entries,
  isConnected,
  isLoading,
  hasMore,
  error,
  onLoadMore,
}: DebugStreamViewProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      const viewport = containerRef.current.querySelector<HTMLElement>(
        '[data-radix-scroll-area-viewport]',
      );
      if (viewport) viewport.scrollTop = 0;
    }
  }, [entries, autoScroll]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, StreamEntry[]>();
    entries.forEach(entry => {
      const sessionId = extractSessionId(entry.data);
      if (!groups.has(sessionId)) {
        groups.set(sessionId, []);
      }
      groups.get(sessionId)!.push(entry);
    });
    return groups;
  }, [entries]);

  useEffect(() => {
    if (groupedEntries.size === 0) return;

    const sessionIds = Array.from(groupedEntries.keys());
    const latestSessionId = sessionIds.reduce((latest, current) => {
      const latestEntries = groupedEntries.get(latest)!;
      const currentEntries = groupedEntries.get(current)!;
      const latestTime = Math.max(
        ...latestEntries.map(e => new Date(e.timestamp).getTime()),
      );
      const currentTime = Math.max(
        ...currentEntries.map(e => new Date(e.timestamp).getTime()),
      );
      return currentTime > latestTime ? current : latest;
    }, sessionIds[0]);

    setExpandedSessions(prev => {
      if (prev.has(latestSessionId)) return prev;
      const next = new Set(prev);
      next.add(latestSessionId);
      return next;
    });
  }, [groupedEntries]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-status-success' : 'bg-fill-muted'
            }`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-fg-tertiary text-xs">
            {entries.length} entries
          </span>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Switch
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="scale-75"
          />
          Auto-scroll
        </label>
      </div>
      {error && (
        <div className="bg-status-error/10 text-status-error mx-2 mb-2 p-2 text-xs">
          {error}
        </div>
      )}
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="bg-surface-bg-primary h-0 flex-1">
          <div className="p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-fg-tertiary flex h-full items-center justify-center">
            Waiting for data...
          </div>
        ) : (
          <>
            {Array.from(groupedEntries.entries()).map(
              ([sessionId, sessionEntries]) => {
                const isSessionExpanded = expandedSessions.has(sessionId);
                const displayName = getSessionDisplayNameFromEntries(
                  sessionEntries,
                  sessionId,
                );
                return (
                  <div key={sessionId} className="mb-2">
                    <button
                      type="button"
                      className="bg-surface-bg-secondary text-fg-primary mb-1 flex w-full cursor-pointer items-center gap-1 p-1 text-left font-semibold"
                      onClick={() => toggleSessionExpanded(sessionId)}>
                      <IconShell size="sm" variant="secondary">
                        {isSessionExpanded ? <ChevronDown /> : <ChevronRight />}
                      </IconShell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>Session: {displayName}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{sessionId}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className="text-fg-tertiary ml-auto text-xs">
                        {sessionEntries.length}{' '}
                        {sessionEntries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </button>
                    {isSessionExpanded && (
                      <div className="ml-4">
                        {sessionEntries.map(entry => {
                          const isExpanded = expandedIds.has(entry.id);
                          return (
                            <div
                              key={entry.id}
                              className="border-stroke-divider mb-1 overflow-hidden border-b pb-1 last:border-b-0">
                              <div className="flex min-w-0 items-center gap-1">
                                <button
                                  type="button"
                                  className="flex shrink-0 cursor-pointer items-center gap-1"
                                  onClick={() => toggleExpanded(entry.id)}>
                                  <IconShell size="sm" variant="secondary">
                                    {isExpanded ? (
                                      <ChevronDown />
                                    ) : (
                                      <ChevronRight />
                                    )}
                                  </IconShell>
                                  <span className="text-fg-tertiary">
                                    {entry.timestamp}
                                  </span>
                                </button>
                                {!isExpanded && (
                                  <span className="text-fg-tertiary w-0 flex-1 truncate">
                                    {JSON.stringify(entry.data)}
                                  </span>
                                )}
                              </div>
                              {isExpanded && (
                                <pre className="text-fg-primary mt-1 break-all whitespace-pre-wrap">
                                  {JSON.stringify(entry.data, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              },
            )}
            {onLoadMore && hasMore && (
              <div className="flex justify-center py-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  disabled={isLoading}>
                  {isLoading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
