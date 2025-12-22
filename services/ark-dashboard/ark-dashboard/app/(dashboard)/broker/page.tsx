'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Memory, memoriesService } from '@/lib/services/memories';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

interface StreamEntry {
  id: string;
  timestamp: string;
  data: unknown;
}

function useSSEStream(endpoint: string, memory: string) {
  const [entries, setEntries] = useState<StreamEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setError(null);
    const url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&watch=true`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error.message || 'Stream error');
          return;
        }
        const entry: StreamEntry = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          timestamp: new Date().toISOString(),
          data,
        };
        setEntries(prev => [entry, ...prev.slice(0, 99)]);
      } catch {
        console.error('Failed to parse SSE data:', event.data);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [endpoint, memory]);

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
    setEntries([]);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { entries, isConnected, error, clear };
}

interface StreamViewProps {
  title: string;
  entries: StreamEntry[];
  isConnected: boolean;
  error: string | null;
  onClear: () => void;
}

function StreamView({
  title,
  entries,
  isConnected,
  error,
  onClear,
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
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
          <Button
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}>
            Auto-scroll
          </Button>
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
          className="bg-muted h-[calc(100vh-320px)] overflow-auto rounded-md p-2 font-mono text-xs">
          {entries.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              Waiting for data...
            </div>
          ) : (
            entries.map(entry => {
              const isExpanded = expandedIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className="border-border mb-1 cursor-pointer border-b pb-1 last:border-b-0"
                  onClick={() => toggleExpanded(entry.id)}>
                  <div className="text-muted-foreground hover:text-foreground mb-0.5 flex items-center gap-1 text-[10px]">
                    <span className="inline-block w-2 text-center">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <span>{entry.timestamp}</span>
                  </div>
                  {isExpanded && (
                    <pre className="break-all whitespace-pre-wrap">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
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
        <Tabs defaultValue="traces" className="flex-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Memory:</span>
              <Select
                value={selectedMemory}
                onValueChange={setSelectedMemory}
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
              error={traces.error}
              onClear={traces.clear}
            />
          </TabsContent>
          <TabsContent value="messages" className="mt-4 flex-1">
            <StreamView
              title="Messages"
              entries={messages.entries}
              isConnected={messages.isConnected}
              error={messages.error}
              onClear={messages.clear}
            />
          </TabsContent>
          <TabsContent value="chunks" className="mt-4 flex-1">
            <StreamView
              title="LLM Chunks"
              entries={chunks.entries}
              isConnected={chunks.isConnected}
              error={chunks.error}
              onClear={chunks.clear}
            />
          </TabsContent>
          <TabsContent value="events" className="mt-4 flex-1">
            <StreamView
              title="Operation Events"
              entries={events.entries}
              isConnected={events.isConnected}
              error={events.error}
              onClear={events.clear}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
