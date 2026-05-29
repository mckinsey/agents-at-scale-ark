'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  createStreamEntryId,
  extractItemTimestamp,
  type PaginatedResponse,
  type StreamEntry,
} from '@/lib/utils/sse-stream';

export type { StreamEntry };

const DEFAULT_PAGE_SIZE = 100;

export interface UseSSEStreamOptions {
  /** Only keep items whose JSON mentions this agent name. Empty = no filter. */
  agentName?: string;
  /** Items requested per fetch page. */
  pageSize?: number;
  /** Fetch every page on init before connecting to the live stream. */
  fetchAllPages?: boolean;
  /** Invoked after a successful purge (e.g. analytics). */
  onPurge?: () => void;
}

export function useSSEStream(
  endpoint: string | null,
  memory: string,
  options: UseSSEStreamOptions = {},
) {
  const {
    agentName = '',
    pageSize = DEFAULT_PAGE_SIZE,
    fetchAllPages = false,
    onPurge,
  } = options;

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
      if (!endpoint) return;
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
            id: createStreamEntryId(),
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
      if (!endpoint) return null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      try {
        let url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&limit=${pageSize}`;
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
            id: createStreamEntryId(`fetched-${cursor ?? 0}-${i}`),
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
    [endpoint, memory, filterByAgent, pageSize],
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

  const purge = useCallback(async () => {
    if (!endpoint) return;
    try {
      const res = await fetch(
        `/api${endpoint}?memory=${encodeURIComponent(memory)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      setStreamedEntries([]);
      setFetchedEntries([]);
      nextCursorRef.current = undefined;
      setHasMore(false);
      onPurge?.();
    } catch (e) {
      toast.error('Failed to purge data', {
        description: (e as Error).message,
      });
    }
  }, [endpoint, memory, onPurge]);

  useEffect(() => {
    mountedRef.current = true;

    if (!endpoint) {
      disconnect();
      setStreamedEntries([]);
      setFetchedEntries([]);
      nextCursorRef.current = undefined;
      setHasMore(true);
      setError(null);
      initialFetchDoneRef.current = false;
      return;
    }

    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;

    async function init() {
      if (fetchAllPages) {
        let cursor: number | undefined;
        while (mountedRef.current) {
          const result = await fetchPage(cursor);
          if (!result || !mountedRef.current) break;
          if (result.hasMore && result.nextCursor !== undefined) {
            cursor = result.nextCursor;
          } else {
            break;
          }
        }
        if (mountedRef.current) connect(cursor);
      } else {
        const result = await fetchPage();
        if (mountedRef.current) connect(result?.nextCursor);
      }
    }
    init();

    return () => {
      mountedRef.current = false;
      disconnect();
      abortControllerRef.current?.abort();
      initialFetchDoneRef.current = false;
    };
  }, [endpoint, connect, disconnect, fetchPage, fetchAllPages]);

  const entries = [...streamedEntries, ...fetchedEntries];

  return { entries, isConnected, isLoading, hasMore, error, clear, purge, loadMore };
}
