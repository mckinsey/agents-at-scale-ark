import { useCallback, useEffect, useRef, useState } from 'react';

export interface StreamEntry {
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

export function useSSEStream(
  endpoint: string,
  memory: string,
  agentName: string,
) {
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
