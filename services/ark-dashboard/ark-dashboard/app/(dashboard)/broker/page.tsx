'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { BrokenImage, ChevronDown, ChevronRight } from '@/components/icons';
import { ResourceEmptyState } from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { FieldLabel, FieldSet } from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { Label } from '@/components/ui/label';
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
import { apiUrl } from '@/lib/api/config';
import { useSSEStream } from '@/lib/hooks/use-sse-stream';
import {
  BROKER_STREAM_PROBE_QUERY_KEY,
  useBrokerStreamProbe,
} from '@/lib/services/broker-streams-hooks';
import { type Memory, memoriesService } from '@/lib/services/memories';
import { cn } from '@/lib/utils';
import { type StreamEntry } from '@/lib/utils/sse-stream';

const PURGE_PAGE_SIZE = 1000;
const BROKER_MEMORY_DOCS_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/reference/resources/memory/';

function trackPurge(streamType: string, memory: string) {
  trackEvent({
    name: 'broker_data_purged',
    properties: { streamType, memoryName: memory },
  });
}

interface StreamPanelProps {
  readonly title: string;
  readonly isConnected: boolean;
  readonly autoScroll: boolean;
  readonly onAutoScrollChange: (next: boolean) => void;
  readonly onPurge: () => void;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly banner?: React.ReactNode;
  readonly children: React.ReactNode;
}

function StreamPanel({
  title,
  isConnected,
  autoScroll,
  onAutoScrollChange,
  onPurge,
  containerRef,
  banner,
  children,
}: StreamPanelProps) {
  const switchId = useId();

  return (
    <div className="border-stroke-divider flex flex-col gap-2 border p-5">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="headings-h4-regular text-fg-primary">{title}</span>
          <span
            role="img"
            aria-label={
              isConnected
                ? `${title} stream connected`
                : `${title} stream disconnected`
            }
            className={cn(
              'size-2 rounded-full',
              isConnected ? 'bg-status-success' : 'bg-fg-disabled',
            )}
          />
        </div>
        <div className="flex items-center justify-end gap-5">
          <Button
            variant="outline"
            size="sm"
            className="text-fg-secondary border-[0.5px]"
            onClick={onPurge}>
            Purge
          </Button>
          <div className="flex items-center gap-3">
            <Switch
              id={switchId}
              size="lg"
              checked={autoScroll}
              onCheckedChange={onAutoScrollChange}
            />
            <Label
              htmlFor={switchId}
              className="label-regular-primary text-fg-primary">
              Auto-scroll
            </Label>
          </div>
        </div>
      </div>
      {banner}
      <div
        ref={containerRef}
        className="flex max-h-[calc(100vh-300px)] w-full flex-col gap-2 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function StreamPlaceholder() {
  return (
    <div className="label-regular-primary text-fg-secondary flex items-center justify-center py-10">
      Waiting for data...
    </div>
  );
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
    <StreamPanel
      title={title}
      isConnected={isConnected}
      autoScroll={autoScroll}
      onAutoScrollChange={setAutoScroll}
      onPurge={onPurge}
      containerRef={containerRef}
      banner={
        error ? (
          <div
            role="alert"
            className="border-status-error text-status-error label-regular-primary border p-2">
            {error}
          </div>
        ) : undefined
      }>
      {entries.length === 0 ? (
        <StreamPlaceholder />
      ) : (
        <>
          {entries.map(entry => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <div key={entry.id} className="w-full">
                <div className="flex w-full min-w-0 items-center gap-2 p-2 pr-5">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    className="flex shrink-0 cursor-pointer items-center gap-2"
                    onClick={() => toggleExpanded(entry.id)}>
                    <IconShell size="default" variant="secondary">
                      {isExpanded ? <ChevronDown /> : <ChevronRight />}
                    </IconShell>
                    <span className="label-regular-primary text-fg-secondary">
                      {entry.timestamp}
                    </span>
                  </button>
                  {!isExpanded && (
                    <span className="label-regular-primary text-fg-tertiary min-w-0 flex-1 truncate">
                      {JSON.stringify(entry.data)}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <pre className="text-fg-secondary px-2 pb-2 font-mono text-xs break-all whitespace-pre-wrap">
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
    </StreamPanel>
  );
}

interface SessionsViewProps {
  readonly memory: string;
  readonly onPurged?: () => void;
}

export function SessionsView({ memory, onPurged }: SessionsViewProps) {
  const [store, setStore] = useState<Record<string, unknown>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(
      apiUrl(
        `/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}&watch=true`,
      ),
    );
    const sessions: Record<string, unknown> = {};

    es.onopen = () => setIsConnected(true);
    es.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.sessionId && data.session) {
          sessions[data.sessionId] = data.session;
          setStore({ sessions: { ...sessions } });
        }
      } catch {
        console.error('Failed to parse session data:', event.data);
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

  const sessions =
    (store as { sessions?: Record<string, unknown> }).sessions || {};
  const sessionIds = Object.keys(sessions).sort((a, b) => {
    const aSession = sessions[a] as { lastActivity?: string };
    const bSession = sessions[b] as { lastActivity?: string };
    return (
      new Date(bSession.lastActivity || 0).getTime() -
      new Date(aSession.lastActivity || 0).getTime()
    );
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
      await fetch(
        apiUrl(`/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}`),
        { method: 'DELETE' },
      );
      setStore({ sessions: {} });
      onPurged?.();
    } catch (e) {
      toast.error('Failed to purge sessions', {
        description: (e as Error).message,
      });
    }
  };

  return (
    <StreamPanel
      title="Sessions"
      isConnected={isConnected}
      autoScroll={autoScroll}
      onAutoScrollChange={setAutoScroll}
      onPurge={handlePurge}
      containerRef={containerRef}>
      {sessionIds.length === 0 ? (
        <StreamPlaceholder />
      ) : (
        sessionIds.map(sid => {
          const isExpanded = expandedIds.has(sid);
          return (
            <div key={sid} className="w-full">
              <div className="flex w-full min-w-0 items-center gap-2 p-2 pr-5">
                <button
                  type="button"
                  aria-label={
                    isExpanded ? 'Collapse session' : 'Expand session'
                  }
                  aria-expanded={isExpanded}
                  className="flex shrink-0 cursor-pointer items-center bg-transparent p-0"
                  onClick={() => toggleExpanded(sid)}>
                  <IconShell size="default" variant="secondary">
                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                  </IconShell>
                </button>
                {(sessions[sid] as { lastActivity?: string })?.lastActivity && (
                  <span className="label-regular-primary text-fg-secondary shrink-0">
                    {(
                      sessions[sid] as { lastActivity?: string }
                    ).lastActivity!.substring(0, 19)}
                    Z
                  </span>
                )}
                <span className="label-regular-primary text-fg-tertiary min-w-0 flex-1 truncate">
                  {sid}
                </span>
              </div>
              {isExpanded && (
                <pre className="text-fg-secondary px-2 pb-2 pl-10 font-mono text-xs break-all whitespace-pre-wrap">
                  {JSON.stringify(sessions[sid], null, 2)}
                </pre>
              )}
            </div>
          );
        })
      )}
    </StreamPanel>
  );
}

export default function BrokerPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [hasMemoriesError, setHasMemoriesError] = useState(false);
  const [activeTab, setActiveTab] = useState('traces');
  const queryClient = useQueryClient();

  const selectedMemoryRef = useRef(selectedMemory);
  selectedMemoryRef.current = selectedMemory;

  const reprobeStreams = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY],
    });
  }, [queryClient]);

  const handlePurged = useCallback(
    (streamType: string) => {
      trackPurge(streamType, selectedMemory);
      reprobeStreams();
    },
    [selectedMemory, reprobeStreams],
  );

  const traces = useSSEStream(
    activeTab === 'traces' ? '/v1/broker/traces' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => handlePurged('traces'),
    },
  );
  const messages = useSSEStream(
    activeTab === 'messages' ? '/v1/broker/messages' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => handlePurged('messages'),
    },
  );
  const chunks = useSSEStream(
    activeTab === 'chunks' ? '/v1/broker/chunks' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => handlePurged('chunks'),
    },
  );
  const events = useSSEStream(
    activeTab === 'events' ? '/v1/broker/events' : null,
    selectedMemory,
    {
      pageSize: PURGE_PAGE_SIZE,
      fetchAllPages: true,
      onPurge: () => handlePurged('events'),
    },
  );

  useEffect(() => {
    async function fetchMemories() {
      try {
        const data = await memoriesService.getAll();
        setMemories(data);
        setHasMemoriesError(false);
        if (
          data.length > 0 &&
          !data.some(m => m.name === selectedMemoryRef.current)
        ) {
          setSelectedMemory(data[0].name);
        }
      } catch (err) {
        setHasMemoriesError(true);
        console.error('Failed to fetch memories:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMemories();
  }, []);

  const hasMemories = memories.length > 0;
  const streamProbe = useBrokerStreamProbe(selectedMemory, {
    enabled: !loading && hasMemories,
  });

  const liveEntryCount =
    traces.entries.length +
    messages.entries.length +
    chunks.entries.length +
    events.entries.length;

  const showEmptyState =
    !loading &&
    !hasMemoriesError &&
    liveEntryCount === 0 &&
    (!hasMemories || streamProbe.data?.isEmpty === true);

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            <BrokenImage />
          </IconShell>
          <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
            Broker
          </h1>
        </div>
        <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
          Manage communication between agents, tools, and workflows
        </p>
      </div>

      {showEmptyState ? (
        <ResourceEmptyState
          icon={<BrokenImage />}
          title="No broker yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any memory yet.</p>
              <p>Get started to see memory.</p>
            </>
          }
          actions={
            <a
              href={BROKER_MEMORY_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer">
              <Button variant="outline">Learn more</Button>
            </a>
          }
        />
      ) : (
        <Tabs
          value={activeTab}
          size="lg"
          padded={false}
          className="mt-5 flex-1"
          onValueChange={tab => {
            setActiveTab(tab);
            trackEvent({
              name: 'broker_tab_changed',
              properties: { tabName: tab },
            });
          }}>
          <div className="flex items-end gap-3">
            <FieldSet className="gap-2">
              <FieldLabel htmlFor="broker-memory">Memory</FieldLabel>
              <Select
                value={selectedMemory}
                onValueChange={value => {
                  setSelectedMemory(value as string);
                  trackEvent({
                    name: 'broker_memory_changed',
                    properties: { memoryName: value as string },
                  });
                }}
                disabled={loading}>
                <SelectTrigger id="broker-memory" className="w-[197px]">
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
            </FieldSet>
            <TabsList className="w-fit">
              <TabsTrigger size="sm" value="traces">
                OTEL Traces
              </TabsTrigger>
              <TabsTrigger size="sm" value="messages">
                Messages
              </TabsTrigger>
              <TabsTrigger size="sm" value="chunks">
                LLM Chunks
              </TabsTrigger>
              <TabsTrigger size="sm" value="events">
                Events
              </TabsTrigger>
              <TabsTrigger size="sm" value="sessions">
                Sessions
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="traces" className="flex-1">
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
          <TabsContent value="messages" className="flex-1">
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
          <TabsContent value="chunks" className="flex-1">
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
          <TabsContent value="events" className="flex-1">
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
          <TabsContent value="sessions" className="flex-1">
            <SessionsView memory={selectedMemory} onPurged={reprobeStreams} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
