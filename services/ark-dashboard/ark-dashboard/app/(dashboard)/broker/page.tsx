'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SessionsView } from '@/components/broker/sessions-view';
import { StreamView } from '@/components/broker/stream-view';
import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { BrokenImage } from '@/components/icons';
import {
  LearnMoreButton,
  ResourceEmptyState,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trackEvent } from '@/lib/analytics/singleton';
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
import { useNamespace } from '@/providers/NamespaceProvider';

const STREAM_PAGE_SIZE = 1000;

const BROKER_TABS: Record<
  BrokerStreamKey,
  { readonly label: string; readonly panelTitle?: string }
> = {
  traces: { label: 'OTEL Traces' },
  messages: { label: 'Messages' },
  chunks: { label: 'LLM Chunks' },
  events: { label: 'Events', panelTitle: 'Operation Events' },
  sessions: { label: 'Sessions' },
};

function panelTitleFor(key: BrokerStreamKey) {
  return BROKER_TABS[key].panelTitle ?? BROKER_TABS[key].label;
}

type EmptyStateKind = 'no-memories' | 'no-records' | 'unavailable';

function getEmptyStateContent(kind: EmptyStateKind, memory: string) {
  if (kind === 'unavailable') {
    return {
      title: 'Broker unavailable',
      description: (
        <>
          <p className="mb-2">Could not read broker records for {memory}.</p>
          <p>Check that the broker service is running, then retry.</p>
        </>
      ),
    };
  }

  if (kind === 'no-memories') {
    return {
      title: 'No stream records',
      description: (
        <>
          <p className="mb-2">No memory resources found.</p>
          <p>Add a memory and run a query to see broker records here.</p>
        </>
      ),
    };
  }

  return {
    title: 'No stream records',
    description: (
      <>
        <p className="mb-2">The broker has no records for {memory}.</p>
        <p>
          Run a query against this memory to see traces, messages, LLM chunks,
          events, and sessions.
        </p>
      </>
    ),
  };
}

interface BrokerStreamTabProps {
  readonly streamKey: Exclude<BrokerStreamKey, 'sessions'>;
  readonly memory: string;
  readonly onPurged: (streamKey: BrokerStreamKey) => void;
  readonly onEntriesPresentChange: (hasEntries: boolean) => void;
}

function BrokerStreamTab({
  streamKey,
  memory,
  onPurged,
  onEntriesPresentChange,
}: Readonly<BrokerStreamTabProps>) {
  const handlePurged = useCallback(
    () => onPurged(streamKey),
    [onPurged, streamKey],
  );

  const stream = useSSEStream(BROKER_STREAM_ENDPOINTS[streamKey], memory, {
    pageSize: STREAM_PAGE_SIZE,
    fetchAllPages: true,
    onPurge: handlePurged,
  });

  const hasEntries = stream.entries.length > 0;

  useEffect(() => {
    onEntriesPresentChange(hasEntries);
    return () => onEntriesPresentChange(false);
  }, [hasEntries, onEntriesPresentChange]);

  return (
    <StreamView
      title={panelTitleFor(streamKey)}
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

export default function BrokerPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [hasMemoriesError, setHasMemoriesError] = useState(false);
  const [activeTab, setActiveTab] = useState<BrokerStreamKey>('traces');
  const [hasLiveEntries, setHasLiveEntries] = useState(false);
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  const selectedMemoryRef = useRef(selectedMemory);
  selectedMemoryRef.current = selectedMemory;

  const reprobeStreams = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [BROKER_STREAM_PROBE_QUERY_KEY],
    });
  }, [queryClient]);

  const handlePurged = useCallback(
    (streamType: BrokerStreamKey) => {
      trackEvent({
        name: 'broker_data_purged',
        properties: { streamType, memoryName: selectedMemory },
      });
      reprobeStreams();
    },
    [selectedMemory, reprobeStreams],
  );

  const handleSessionsPurged = useCallback(
    () => handlePurged('sessions'),
    [handlePurged],
  );

  useEffect(() => {
    let isStale = false;
    async function fetchMemories() {
      setLoading(true);
      try {
        const data = await memoriesService.getAll(namespace);
        if (isStale) return;
        setMemories(data);
        setHasMemoriesError(false);
        if (
          data.length > 0 &&
          !data.some(m => m.name === selectedMemoryRef.current)
        ) {
          setSelectedMemory(data[0].name);
        }
      } catch (err) {
        if (isStale) return;
        setHasMemoriesError(true);
        console.error('Failed to fetch memories:', err);
      } finally {
        if (!isStale) setLoading(false);
      }
    }
    fetchMemories();
    return () => {
      isStale = true;
    };
  }, [namespace]);

  const hasMemories = memories.length > 0;
  const streamProbe = useBrokerStreamProbe(selectedMemory, {
    enabled: !loading && hasMemories,
  });

  const isResolving =
    loading || (hasMemories && streamProbe.data === undefined);
  const showLoading = useDelayedLoading(isResolving);

  const isBrokerUnreachable = hasMemories && streamProbe.data === 'unknown';

  const showEmptyState =
    !hasMemoriesError &&
    !hasLiveEntries &&
    (!hasMemories || streamProbe.data === 'empty' || isBrokerUnreachable);

  let emptyStateKind: EmptyStateKind = 'no-records';
  if (isBrokerUnreachable) emptyStateKind = 'unavailable';
  else if (!hasMemories) emptyStateKind = 'no-memories';

  const { title: emptyStateTitle, description: emptyStateDescription } =
    getEmptyStateContent(emptyStateKind, selectedMemory);

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
            const memoryName = String(value);
            setSelectedMemory(memoryName);
            trackEvent({
              name: 'broker_memory_changed',
              properties: { memoryName },
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

      {isResolving && showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <span className="label-regular-primary text-fg-secondary">
            Loading...
          </span>
        </div>
      )}
      {!isResolving && showEmptyState && (
        <ResourceEmptyState
          icon={<BrokenImage />}
          title={emptyStateTitle}
          description={emptyStateDescription}
          actions={
            <>
              {isBrokerUnreachable && (
                <Button
                  disabled={streamProbe.isFetching}
                  onClick={() => {
                    streamProbe.refetch();
                  }}>
                  Retry
                </Button>
              )}
              <LearnMoreButton href={DOCS_URLS.observability} />
            </>
          }
        />
      )}
      {!isResolving && !showEmptyState && (
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
                  {BROKER_TABS[key].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {BROKER_STREAM_KEYS.map(key => (
            <TabsContent
              key={key}
              value={key}
              className="flex min-h-0 flex-1 flex-col">
              {key === 'sessions' ? (
                <SessionsView
                  memory={selectedMemory}
                  title={panelTitleFor(key)}
                  onPurged={handleSessionsPurged}
                />
              ) : (
                <BrokerStreamTab
                  key={`${key}:${selectedMemory}`}
                  streamKey={key}
                  memory={selectedMemory}
                  onPurged={handlePurged}
                  onEntriesPresentChange={setHasLiveEntries}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
