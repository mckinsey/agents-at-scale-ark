'use client';

import {
  Bug,
  ChevronDown,
  ChevronRight,
  Info,
  MessageCircle,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type BrokerStatus, proxyService } from '@/lib/services/proxy';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';
type DebugStreamType = 'traces' | 'events';

interface StreamEntry {
  id: string;
  timestamp: string;
  data: unknown;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
}

const PAGE_SIZE = 100;

function extractItemTimestamp(item: unknown): string {
  if (!item) {
    return new Date().toISOString();
  }
  const typedItem = item as Record<string, unknown>;
  if (typedItem.timestamp) {
    return typedItem.timestamp as string;
  }
  let unixTimestamp = '';
  if (typedItem?.startTimeUnixNano) {
    unixTimestamp = typedItem.startTimeUnixNano as string;
  }
  const spans = typedItem?.spans as Array<Record<string, unknown>>;
  if (!unixTimestamp && spans && spans.length > 0) {
    unixTimestamp = spans[0].startTimeUnixNano as string;
  }
  if (unixTimestamp) {
    return new Date(parseInt(unixTimestamp.substring(0, 13))).toISOString();
  }
  return new Date().toISOString();
}

function useSSEStream(endpoint: string, memory: string, agentName: string) {
  const [streamedEntries, setStreamedEntries] = useState<StreamEntry[]>([]);
  const [fetchedEntries, setFetchedEntries] = useState<StreamEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextCursorRef = useRef<number | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialFetchDoneRef = useRef(false);
  const mountedRef = useRef(true);

  const filterByAgent = useCallback(
    (item: unknown): boolean => {
      if (!agentName) return true;
      const str = JSON.stringify(item);
      return str.toLowerCase().includes(agentName.toLowerCase());
    },
    [agentName],
  );

  const connect = useCallback(
    (cursor?: number) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      setError(null);
      let url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&watch=true`;
      if (cursor !== undefined && cursor !== null) {
        url += `&cursor=${cursor}`;
      }
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = event => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            setError(data.error.message || 'Stream error');
            return;
          }
          if (!filterByAgent(data)) return;
          const entry: StreamEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            timestamp: extractItemTimestamp(data),
            data,
          };
          setStreamedEntries(prev => [entry, ...prev.slice(0, 499)]);
        } catch {
          console.error('Failed to parse SSE data:', event.data);
        }
      };

      eventSource.onerror = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        eventSource.close();
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect(nextCursorRef.current);
          }
        }, 3000);
      };
    },
    [endpoint, memory, filterByAgent],
  );

  const fetchPage = useCallback(
    async (cursor?: number) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      try {
        let url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&limit=${PAGE_SIZE}`;
        if (cursor !== undefined && cursor !== null) {
          url += `&cursor=${cursor}`;
        }
        const response = await fetch(url, {
          signal: abortControllerRef.current.signal,
        });
        if (!mountedRef.current) return null;
        const data: PaginatedResponse<unknown> = await response.json();
        if ((data as unknown as { error?: { message?: string } }).error) {
          if (mountedRef.current) {
            setError(
              (data as unknown as { error: { message?: string } }).error
                .message || 'Fetch error',
            );
          }
          return null;
        }
        const newEntries: StreamEntry[] = data.items
          .filter(filterByAgent)
          .map((item, i) => ({
            id: `fetched-${cursor ?? 0}-${i}-${Math.random().toString(36).substring(2, 11)}`,
            timestamp: extractItemTimestamp(item),
            data: item,
          }));
        if (mountedRef.current) {
          setFetchedEntries(prev => [...prev, ...newEntries]);
          setHasMore(data.hasMore);
        }
        nextCursorRef.current = data.nextCursor;
        return data;
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && mountedRef.current) {
          setError('Failed to fetch data');
        }
        return null;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [endpoint, memory, filterByAgent],
  );

  const loadMore = useCallback(() => {
    if (
      !isLoading &&
      hasMore &&
      nextCursorRef.current !== undefined &&
      nextCursorRef.current !== null
    ) {
      fetchPage(nextCursorRef.current);
    }
  }, [fetchPage, isLoading, hasMore]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const clear = useCallback(() => {
    setStreamedEntries([]);
    setFetchedEntries([]);
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    mountedRef.current = true;

    async function init() {
      const result = await fetchPage();
      if (mountedRef.current) {
        connect(result?.nextCursor);
      }
    }
    init();

    return () => {
      mountedRef.current = false;
      disconnect();
      abortControllerRef.current?.abort();
      initialFetchDoneRef.current = false;
    };
  }, [connect, disconnect, fetchPage]);

  const entries = [...streamedEntries, ...fetchedEntries];

  return { entries, isConnected, isLoading, hasMore, error, clear, loadMore };
}

interface DebugStreamViewProps {
  entries: StreamEntry[];
  isConnected: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  error: string | null;
  onLoadMore?: () => void;
}

function DebugStreamView({
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

  const extractSessionId = (data: unknown): string => {
    const item = data as Record<string, unknown>;

    // CASE: Trace - Try to extract session ID from spans
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

    // CASE: Trace Span - Try to extract session ID from attributes
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

    // CASE: Event - Try to extract session ID from event data
    if (item.data && typeof item.data === 'object' && item.data !== null) {
      const eventData = item.data as Record<string, unknown>;
      if (eventData.sessionId && typeof eventData.sessionId === 'string') {
        return eventData.sessionId;
      }
    }

    return 'unknown';
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

interface EmbeddedChatPanelProps {
  name: string;
  type: ChatType;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
}

export function EmbeddedChatPanel({
  name,
  type,
  strategy,
  selectorAgentName,
  graphEdges,
}: EmbeddedChatPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [debugStreamType, setDebugStreamType] =
    useState<DebugStreamType>('traces');
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | 'checking'>(
    'checking',
  );

  const traces = useSSEStream('/v1/broker/traces', 'default', name);
  const events = useSSEStream('/v1/broker/events', 'default', name);

  useEffect(() => {
    proxyService
      .checkBrokerHealth()
      .then(setBrokerStatus)
      .catch(() => setBrokerStatus('not-installed'));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as TabType)}
        className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-4 py-3">
            <MessageCircle className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">Chat with {name}</span>
          </div>
          <TabsList className="mx-4 mb-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <Bug className="h-3.5 w-3.5" />
              Debug
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          <ChatPanel
            name={name}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
          />
        </TabsContent>

        <TabsContent
          value="debug"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          {brokerStatus === 'checking' && (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Checking broker availability...
            </div>
          )}
          {brokerStatus === 'not-installed' && (
            <div className="p-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Broker service not available</AlertTitle>
                <AlertDescription>
                  For the debug view to work, install the broker service and
                  turn on the setting in the experimental features window
                  (Ctrl+E).
                </AlertDescription>
              </Alert>
            </div>
          )}
          {brokerStatus === 'not-running' && (
            <div className="p-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Broker service is not running</AlertTitle>
                <AlertDescription>
                  The broker service is installed but is not currently running.
                </AlertDescription>
              </Alert>
            </div>
          )}
          {brokerStatus === 'available' && (
            <Tabs
              value={debugStreamType}
              onValueChange={v => setDebugStreamType(v as DebugStreamType)}
              className="flex h-full flex-col">
              <TabsList className="mx-2 mt-2 grid w-auto grid-cols-2">
                <TabsTrigger value="traces" className="text-xs">
                  Traces
                </TabsTrigger>
                <TabsTrigger value="events" className="text-xs">
                  Cluster Events
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="traces"
                className="mt-0 flex-1 overflow-hidden">
                <DebugStreamView
                  entries={traces.entries}
                  isConnected={traces.isConnected}
                  isLoading={traces.isLoading}
                  hasMore={traces.hasMore}
                  error={traces.error}
                  onLoadMore={traces.loadMore}
                />
              </TabsContent>
              <TabsContent
                value="events"
                className="mt-0 flex-1 overflow-hidden">
                <DebugStreamView
                  entries={events.entries}
                  isConnected={events.isConnected}
                  isLoading={events.isLoading}
                  hasMore={events.hasMore}
                  error={events.error}
                  onLoadMore={events.loadMore}
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
