'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useSSEStream } from '@/lib/hooks/use-sse-stream';
import { type Memory, memoriesService } from '@/lib/services/memories';
import { type StreamEntry } from '@/lib/utils/sse-stream';

const PURGE_PAGE_SIZE = 1000;

function trackPurge(streamType: string, memory: string) {
  trackEvent({
    name: 'broker_data_purged',
    properties: { streamType, memoryName: memory },
  });
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

export function SessionsView({ memory }: { memory: string }) {
  const [store, setStore] = useState<Record<string, unknown>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}&watch=true`);
    const sessions: Record<string, unknown> = {};

    es.onopen = () => setIsConnected(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId && data.session) {
          sessions[data.sessionId] = data.session;
          setStore({ sessions: { ...sessions } });
        }
      } catch {
      }
    };
    es.onerror = () => setIsConnected(false);

    return () => es.close();
  }, [memory]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [store, autoScroll]);

  const sessions = (store as { sessions?: Record<string, unknown> }).sessions || {};
  const sessionIds = Object.keys(sessions).sort((a, b) => {
    const aSession = sessions[a] as { lastActivity?: string };
    const bSession = sessions[b] as { lastActivity?: string };
    return new Date(bSession.lastActivity || 0).getTime() - new Date(aSession.lastActivity || 0).getTime();
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePurge = async () => {
    try {
      await fetch(`/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}`, { method: 'DELETE' });
      setStore({ sessions: {} });
    } catch {
    }
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">Sessions</CardTitle>
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePurge}>
            Purge
          </Button>
          <label className="flex items-center gap-1.5 text-sm">
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
            Auto-scroll
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="bg-muted h-[calc(100vh-280px)] overflow-x-hidden overflow-y-auto rounded-md p-2 font-mono text-xs">
          {sessionIds.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              Waiting for data...
            </div>
          ) : (
            sessionIds.map(sid => {
              const isExpanded = expandedIds.has(sid);
              return (
                <div key={sid} className="border-border mb-1 overflow-hidden border-b pb-1 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={isExpanded ? 'Collapse session' : 'Expand session'}
                      aria-expanded={isExpanded}
                      className="flex shrink-0 cursor-pointer items-center gap-1 bg-transparent p-0"
                      onClick={() => toggleExpanded(sid)}>
                      {isExpanded ? (
                        <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                      )}
                    </button>
                    {(sessions[sid] as { lastActivity?: string })?.lastActivity && (
                      <span className="text-muted-foreground shrink-0">
                        {(sessions[sid] as { lastActivity?: string }).lastActivity!.substring(0, 19)}Z
                      </span>
                    )}
                    <span className="truncate">{sid}</span>
                  </div>
                  {isExpanded && (
                    <pre className="mt-1 whitespace-pre-wrap break-all pl-5">
                      {JSON.stringify(sessions[sid], null, 2)}
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
  const [activeTab, setActiveTab] = useState('traces');

  const traces = useSSEStream(
    activeTab === 'traces' ? '/v1/broker/traces' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => trackPurge('traces', selectedMemory),
    },
  );
  const messages = useSSEStream(
    activeTab === 'messages' ? '/v1/broker/messages' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => trackPurge('messages', selectedMemory),
    },
  );
  const chunks = useSSEStream(
    activeTab === 'chunks' ? '/v1/broker/chunks' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => trackPurge('chunks', selectedMemory),
    },
  );
  const events = useSSEStream(
    activeTab === 'events' ? '/v1/broker/events' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => trackPurge('events', selectedMemory),
    },
  );

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
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Broker" />
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl">Broker</h1>
        <Tabs
          defaultValue="traces"
          className="flex-1"
          onValueChange={tab => {
            setActiveTab(tab);
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
                onValueChange={(value) => {
                  setSelectedMemory(value as string);
                  trackEvent({
                    name: 'broker_memory_changed',
                    properties: { memoryName: value as string },
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
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
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
          <TabsContent value="sessions" className="mt-4 flex-1">
            <SessionsView memory={selectedMemory} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
