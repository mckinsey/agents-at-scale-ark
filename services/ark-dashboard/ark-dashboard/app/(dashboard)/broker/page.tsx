'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trackEvent } from '@/lib/analytics/singleton';
import { type Memory, memoriesService } from '@/lib/services/memories';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

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

function useSSEStream(endpoint: string, memory: string) {
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
    [endpoint, memory],
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
        const newEntries: StreamEntry[] = data.items.map((item, i) => ({
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
    [endpoint, memory],
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

  const purge = useCallback(async () => {
    try {
      const res = await fetch(
        `/api${endpoint}?memory=${encodeURIComponent(memory)}`,
        {
          method: 'DELETE',
        },
      );
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      setStreamedEntries([]);
      setFetchedEntries([]);
      nextCursorRef.current = undefined;
      setHasMore(false);
      trackEvent({
        name: 'broker_data_purged',
        properties: {
          streamType: endpoint.split('/').pop(),
          memoryName: memory,
        },
      });
    } catch (e) {
      toast.error('Failed to purge data', {
        description: (e as Error).message,
      });
    }
  }, [endpoint, memory]);

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

  return { entries, isConnected, isLoading, hasMore, error, purge, loadMore };
}

interface StreamViewProps {
  title: string;
  entries: StreamEntry[];
  isConnected: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  error: string | null;
  onPurge: () => void;
  onLoadMore?: () => void;
}

function StreamView({
  title,
  entries,
  isConnected,
  isLoading,
  hasMore,
  error,
  onPurge,
  onLoadMore,
}: StreamViewProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPurge}>
            Purge
          </Button>
          <label className="flex items-center gap-1.5 text-sm">
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
            Auto-scroll
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {error && (
          <div className="mb-2 rounded bg-red-100 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div
          ref={containerRef}
          className="bg-muted h-[calc(100vh-280px)] overflow-x-hidden overflow-y-auto rounded-md p-2 font-mono text-xs">
          {entries.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              Waiting for data...
            </div>
          ) : (
            <>
              {entries.map(entry => {
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
                        <span>{entry.timestamp}</span>
                      </span>
                      {!isExpanded && (
                        <span className="text-muted-foreground w-0 flex-1 truncate">
                          {JSON.stringify(entry.data)}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <pre className="mt-1 break-all whitespace-pre-wrap">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
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
      </CardContent>
    </Card>
  );
}

export default function BrokerPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<string>('default');
  const [loading, setLoading] = useState(true);

  const traces = useSSEStream('/v1/broker/traces', selectedMemory);
  const messages = useSSEStream('/v1/broker/messages', selectedMemory);
  const chunks = useSSEStream('/v1/broker/chunks', selectedMemory);
  const events = useSSEStream('/v1/broker/events', selectedMemory);

  useEffect(() => {
    async function fetchMemories() {
      try {
        const data = await memoriesService.getAll();
        setMemories(data);
        if (data.length > 0 && !data.find(m => m.name === selectedMemory)) {
          setSelectedMemory(data[0].name);
        }
      } catch (err) {
        console.error('Failed to fetch memories:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMemories();
  }, [selectedMemory]);

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Broker" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Tabs
          defaultValue="traces"
          className="flex-1"
          onValueChange={tab => {
            trackEvent({
              name: 'broker_tab_changed',
              properties: { tabName: tab },
            });
          }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Memory:</span>
              <Select
                value={selectedMemory}
                onValueChange={value => {
                  setSelectedMemory(value);
                  trackEvent({
                    name: 'broker_memory_changed',
                    properties: { memoryName: value },
                  });
                }}
                disabled={loading}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue
                    placeholder={loading ? 'Loading...' : 'Select memory'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {memories.map(memory => (
                    <SelectItem key={memory.name} value={memory.name}>
                      {memory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TabsList>
              <TabsTrigger value="traces">OTEL Traces</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="chunks">LLM Chunks</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="traces" className="mt-4 flex-1">
            <StreamView
              title="OTEL Traces"
              entries={traces.entries}
              isConnected={traces.isConnected}
              isLoading={traces.isLoading}
              hasMore={traces.hasMore}
              error={traces.error}
              onPurge={traces.purge}
              onLoadMore={traces.loadMore}
            />
          </TabsContent>
          <TabsContent value="messages" className="mt-4 flex-1">
            <StreamView
              title="Messages"
              entries={messages.entries}
              isConnected={messages.isConnected}
              isLoading={messages.isLoading}
              hasMore={messages.hasMore}
              error={messages.error}
              onPurge={messages.purge}
              onLoadMore={messages.loadMore}
            />
          </TabsContent>
          <TabsContent value="chunks" className="mt-4 flex-1">
            <StreamView
              title="LLM Chunks"
              entries={chunks.entries}
              isConnected={chunks.isConnected}
              isLoading={chunks.isLoading}
              hasMore={chunks.hasMore}
              error={chunks.error}
              onPurge={chunks.purge}
              onLoadMore={chunks.loadMore}
            />
          </TabsContent>
          <TabsContent value="events" className="mt-4 flex-1">
            <StreamView
              title="Operation Events"
              entries={events.entries}
              isConnected={events.isConnected}
              isLoading={events.isLoading}
              hasMore={events.hasMore}
              error={events.error}
              onPurge={events.purge}
              onLoadMore={events.loadMore}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
