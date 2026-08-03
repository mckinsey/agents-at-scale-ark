'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { BrokenImage, ChevronDown, ChevronRight } from '@/components/icons';
import {
  LearnMoreButton,
  ResourceEmptyState,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
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
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDelayedLoading } from '@/lib/hooks';
import { useSSEStream } from '@/lib/hooks/use-sse-stream';
import {
  BROKER_STREAM_ENDPOINTS,
  BROKER_STREAM_KEYS,
  type BrokerStreamKey,
} from '@/lib/services/broker-streams';
import {
  BROKER_STREAM_PROBE_QUERY_KEY,
  useBrokerStreamProbe,
} from '@/lib/services/broker-streams-hooks';
import { type Memory, memoriesService } from '@/lib/services/memories';
import { cn } from '@/lib/utils';
import { type StreamEntry } from '@/lib/utils/sse-stream';

const PURGE_PAGE_SIZE = 1000;

const BROKER_TABS: Record<
  BrokerStreamKey,
  { readonly tabLabel: string; readonly panelTitle: string }
> = {
  traces: { tabLabel: 'OTEL Traces', panelTitle: 'OTEL Traces' },
  messages: { tabLabel: 'Messages', panelTitle: 'Messages' },
  chunks: { tabLabel: 'LLM Chunks', panelTitle: 'LLM Chunks' },
  events: { tabLabel: 'Events', panelTitle: 'Operation Events' },
  sessions: { tabLabel: 'Sessions', panelTitle: 'Sessions' },
};

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
  readonly error?: string | null;
  readonly children: React.ReactNode;
}

function StreamPanel({
  title,
  isConnected,
  autoScroll,
  onAutoScrollChange,
  onPurge,
  containerRef,
  error,
  children,
}: StreamPanelProps) {
  const switchId = useId();

  return (
    <div className="border-stroke-divider flex min-h-0 flex-1 flex-col gap-2 border p-5">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="headings-h4-regular text-fg-primary">{title}</span>
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              isConnected ? 'bg-status-success' : 'bg-fg-disabled',
            )}
          />
          <span className="sr-only">
            {isConnected
              ? `${title} stream connected`
              : `${title} stream disconnected`}
          </span>
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
      {error && (
        <div
          role="alert"
          className="border-status-error text-status-error label-regular-primary border p-2">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto">
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
      error={error}>
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

interface BrokerStreamTabProps {
  readonly streamKey: Exclude<BrokerStreamKey, 'sessions'>;
  readonly title: string;
  readonly memory: string;
  readonly onPurged: () => void;
  readonly onEntriesPresentChange: (hasEntries: boolean) => void;
}

function BrokerStreamTab({
  streamKey,
  title,
  memory,
  onPurged,
  onEntriesPresentChange,
}: BrokerStreamTabProps) {
  const stream = useSSEStream(BROKER_STREAM_ENDPOINTS[streamKey], memory, {
    pageSize: PURGE_PAGE_SIZE,
    fetchAllPages: true,
    onPurge: onPurged,
  });

  const hasEntries = stream.entries.length > 0;

  useEffect(() => {
    onEntriesPresentChange(hasEntries);
  }, [hasEntries, onEntriesPresentChange]);

  return (
    <StreamView
      title={title}
      entries={stream.entries}
      isConnected={stream.isConnected}
      isLoading={stream.isLoading}
      hasMore={stream.hasMore}
      error={stream.error}
      onPurge={stream.purge}
      onLoadMore={stream.loadMore}
    />
  );
}

interface BrokerSession {
  readonly lastActivity?: string;
}

interface SessionsViewProps {
  readonly memory: string;
  readonly onPurged?: () => void;
}

export function SessionsView({ memory, onPurged }: SessionsViewProps) {
  const [sessions, setSessions] = useState<Record<string, BrokerSession>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessions({});
    const es = new EventSource(
      apiUrl(
        `/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}&watch=true`,
      ),
    );

    es.onopen = () => setIsConnected(true);
    es.onmessage = event => {
      try {
        const data: { sessionId?: string; session?: BrokerSession } = JSON.parse(
          event.data,
        );
        const { sessionId, session } = data;
        if (sessionId && session) {
          setSessions(prev => ({ ...prev, [sessionId]: session }));
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
  }, [sessions, autoScroll]);

  const sessionIds = Object.keys(sessions).sort(
    (a, b) =>
      new Date(sessions[b].lastActivity ?? 0).getTime() -
      new Date(sessions[a].lastActivity ?? 0).getTime(),
  );

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
      const response = await fetch(
        apiUrl(`/api/v1/broker/sessions?memory=${encodeURIComponent(memory)}`),
        { method: 'DELETE' },
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      setSessions({});
      setError(null);
      onPurged?.();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error('Failed to purge sessions', { description: message });
    }
  };

  return (
    <StreamPanel
      title="Sessions"
      isConnected={isConnected}
      autoScroll={autoScroll}
      onAutoScrollChange={setAutoScroll}
      onPurge={handlePurge}
      containerRef={containerRef}
      error={error}>
      {sessionIds.length === 0 ? (
        <StreamPlaceholder />
      ) : (
        sessionIds.map(sid => {
          const isExpanded = expandedIds.has(sid);
          const lastActivity = sessions[sid].lastActivity;
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
                {lastActivity && (
                  <span className="label-regular-primary text-fg-secondary shrink-0">
                    {lastActivity.substring(0, 19)}Z
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
  const [activeTab, setActiveTab] = useState<BrokerStreamKey>('traces');
  const [hasLiveEntries, setHasLiveEntries] = useState(false);
  const queryClient = useQueryClient();

  const selectedMemoryRef = useRef(selectedMemory);
  selectedMemoryRef.current = selectedMemory;

  const reprobeStreams = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY],
    });
  }, [queryClient]);

  const handlePurged = useCallback(
    (streamType: BrokerStreamKey) => {
      trackPurge(streamType, selectedMemory);
      reprobeStreams();
    },
    [selectedMemory, reprobeStreams],
  );

  const handleStreamPurged = useCallback(
    () => handlePurged(activeTab),
    [handlePurged, activeTab],
  );

  const handleSessionsPurged = useCallback(
    () => handlePurged('sessions'),
    [handlePurged],
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

  const isResolving =
    loading || (hasMemories && streamProbe.data === undefined);
  const showLoading = useDelayedLoading(isResolving);

  const showEmptyState =
    !hasMemoriesError &&
    !hasLiveEntries &&
    (!hasMemories || streamProbe.data === 'empty');

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col">
      <ResourcePageHeader
        icon={<BrokenImage />}
        title="Broker"
        description="Manage communication between agents, tools, and workflows"
      />

      <div className="mt-5 flex items-center gap-2">
        <Label
          htmlFor="broker-memory"
          className="label-regular-primary text-fg-primary">
          Memory
        </Label>
        <Select
          value={selectedMemory}
          onValueChange={value => {
            setSelectedMemory(value as string);
            setHasLiveEntries(false);
            trackEvent({
              name: 'broker_memory_changed',
              properties: { memoryName: value as string },
            });
          }}
          disabled={loading || !hasMemories}>
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
      </div>

      {isResolving ? (
        showLoading && (
          <div className="mt-5 flex flex-1 items-center justify-center">
            <span className="label-regular-primary text-fg-secondary">
              Loading...
            </span>
          </div>
        )
      ) : showEmptyState ? (
        <ResourceEmptyState
          icon={<BrokenImage />}
          title="No stream records"
          description={
            hasMemories ? (
              <>
                <p className="mb-2">
                  The broker has no records for {selectedMemory}.
                </p>
                <p>
                  Run a query against this memory to see traces, messages, LLM
                  chunks, events, and sessions.
                </p>
              </>
            ) : (
              <>
                <p className="mb-2">No memory resources found.</p>
                <p>Add a memory and run a query to see broker records here.</p>
              </>
            )
          }
          actions={<LearnMoreButton href={DOCS_URLS.observability} />}
        />
      ) : (
        <Tabs
          value={activeTab}
          size="lg"
          padded={false}
          className="mt-5 flex min-h-0 flex-1 flex-col"
          onValueChange={tab => {
            setActiveTab(tab as BrokerStreamKey);
            trackEvent({
              name: 'broker_tab_changed',
              properties: { tabName: tab },
            });
          }}>
          <div className="flex items-end gap-3">
            <TabsList className="w-fit">
              {BROKER_STREAM_KEYS.map(key => (
                <TabsTrigger key={key} size="sm" value={key}>
                  {BROKER_TABS[key].tabLabel}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent
            value={activeTab}
            className="flex min-h-0 flex-1 flex-col">
            {activeTab === 'sessions' ? (
              <SessionsView
                memory={selectedMemory}
                onPurged={handleSessionsPurged}
              />
            ) : (
              <BrokerStreamTab
                key={`${activeTab}:${selectedMemory}`}
                streamKey={activeTab}
                title={BROKER_TABS[activeTab].panelTitle}
                memory={selectedMemory}
                onPurged={handleStreamPurged}
                onEntriesPresentChange={setHasLiveEntries}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
