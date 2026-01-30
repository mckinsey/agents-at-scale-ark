import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import type { StreamEntry } from './use-sse-stream';

interface DebugStreamViewProps {
  entries: StreamEntry[];
  isConnected: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  error: string | null;
  onLoadMore?: () => void;
}

function extractSessionId(data: unknown): string {
  const item = data as Record<string, unknown>;

  if (item.spans && Array.isArray(item.spans) && item.spans.length > 0) {
    const span = item.spans[0] as Record<string, unknown>;
    if (span.attributes && Array.isArray(span.attributes)) {
      const sessionAttr = span.attributes.find(
        (attr: unknown) =>
          typeof attr === 'object' &&
          attr !== null &&
          'key' in attr &&
          attr.key === 'session.id',
      ) as { value?: string } | undefined;
      if (sessionAttr?.value) {
        return sessionAttr.value;
      }
    }
  }

  if (item.attributes && Array.isArray(item.attributes)) {
    const sessionAttr = item.attributes.find(
      (attr: unknown) =>
        typeof attr === 'object' &&
        attr !== null &&
        'key' in attr &&
        attr.key === 'session.id',
    ) as { value?: string } | undefined;
    if (sessionAttr?.value) {
      return sessionAttr.value;
    }
  }

  if (item.data && typeof item.data === 'object' && item.data !== null) {
    const eventData = item.data as Record<string, unknown>;
    if (eventData.sessionId && typeof eventData.sessionId === 'string') {
      return eventData.sessionId;
    }
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
      containerRef.current.scrollTop = 0;
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
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-muted-foreground text-xs">
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
        <div className="mx-2 mb-2 rounded bg-red-100 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="bg-muted/50 flex-1 overflow-y-auto p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            Waiting for data...
          </div>
        ) : (
          <>
            {Array.from(groupedEntries.entries()).map(
              ([sessionId, sessionEntries]) => {
                const isSessionExpanded = expandedSessions.has(sessionId);
                return (
                  <div key={sessionId} className="mb-2">
                    <div
                      className="bg-muted/80 mb-1 flex cursor-pointer items-center gap-1 rounded p-1 font-semibold"
                      onClick={() => toggleSessionExpanded(sessionId)}>
                      {isSessionExpanded ? (
                        <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                      )}
                      <span>Session: {sessionId}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {sessionEntries.length}{' '}
                        {sessionEntries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    {isSessionExpanded && (
                      <div className="ml-4">
                        {sessionEntries.map(entry => {
                          const isExpanded = expandedIds.has(entry.id);
                          return (
                            <div
                              key={entry.id}
                              className="border-border mb-1 overflow-hidden border-b pb-1 last:border-b-0">
                              <div className="flex min-w-0 items-center gap-1">
                                <span
                                  className="flex shrink-0 cursor-pointer items-center gap-1"
                                  onClick={() => toggleExpanded(entry.id)}>
                                  {isExpanded ? (
                                    <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                                  )}
                                  <span className="text-muted-foreground">
                                    {entry.timestamp}
                                  </span>
                                </span>
                                {!isExpanded && (
                                  <span className="text-muted-foreground w-0 flex-1 truncate">
                                    {JSON.stringify(entry.data)}
                                  </span>
                                )}
                              </div>
                              {isExpanded && (
                                <pre className="text-foreground mt-1 break-all whitespace-pre-wrap">
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
    </div>
  );
}
