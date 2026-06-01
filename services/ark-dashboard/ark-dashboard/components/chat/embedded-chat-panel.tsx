'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import {
  BugReport,
  ChatBubble,
  ChevronDown,
  ChevronRight,
  ErrorIcon,
  Info,
} from '@/components/icons';
import { Alert, AlertIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getSessionDisplayNameFromEntries } from '@/lib/broker/session-utils';
import { useSSEStream } from '@/lib/hooks/use-sse-stream';
import { type BrokerStatus, proxyService } from '@/lib/services/proxy';
import type { GraphEdge } from '@/lib/types/chat-message';
import { type StreamEntry } from '@/lib/utils/sse-stream';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';
type DebugStreamType = 'traces' | 'events';

function unwrapAttrValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.stringValue === 'string') return v.stringValue;
    if (typeof v.intValue === 'string') return v.intValue;
    if (typeof v.intValue === 'number') return String(v.intValue);
    if (typeof v.boolValue === 'boolean') return String(v.boolValue);
    if (typeof v.doubleValue === 'number') return String(v.doubleValue);
  }
  return undefined;
}

function findAttrValue(attributes: unknown, key: string): string | undefined {
  if (!Array.isArray(attributes)) return undefined;
  const attr = attributes.find(
    (a: unknown) =>
      typeof a === 'object' && a !== null && 'key' in a && a.key === key,
  ) as { value?: unknown } | undefined;
  return unwrapAttrValue(attr?.value);
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
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && viewportRef.current) {
      viewportRef.current.scrollTop = 0;
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
    if (Array.isArray(item.spans)) {
      for (const span of item.spans) {
        if (!span || typeof span !== 'object') continue;
        const fromSpan = findAttrValue(
          (span as Record<string, unknown>).attributes,
          'ark.session.id',
        );
        if (fromSpan) return fromSpan;
      }
    }

    // CASE: Trace Span - Try to extract session ID from attributes
    const fromTop = findAttrValue(item.attributes, 'ark.session.id');
    if (fromTop) return fromTop;

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
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-status-success' : 'bg-fg-tertiary'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-fg-tertiary text-xs">
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
        <div className="bg-status-error/10 text-status-error mx-2 mb-2 p-2 text-xs">
          {error}
        </div>
      )}
      <ScrollArea
        viewportRef={viewportRef}
        className="bg-surface-bg-secondary h-0 min-h-0 flex-1">
        <div className="h-full p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-fg-tertiary flex h-full items-center justify-center">
            Waiting for data...
          </div>
        ) : (
          <>
            {Array.from(groupedEntries.entries()).map(
              ([sessionId, sessionEntries]) => {
                const isSessionExpanded = expandedSessions.has(sessionId);
                const displayName = getSessionDisplayNameFromEntries(
                  sessionEntries,
                  sessionId,
                );
                return (
                  <div key={sessionId} className="mb-2">
                    <div
                      className="bg-surface-bg-tertiary mb-1 flex cursor-pointer items-center gap-1 p-1 font-semibold"
                      onClick={() => toggleSessionExpanded(sessionId)}>
                      <IconShell size="sm" className="shrink-0">
                        {isSessionExpanded ? <ChevronDown /> : <ChevronRight />}
                      </IconShell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>Session: {displayName}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{sessionId}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className="text-fg-tertiary ml-auto text-xs">
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
                              className="border-stroke-divider mb-1 overflow-hidden border-b pb-1 last:border-b-0">
                              <div className="flex min-w-0 items-center gap-1">
                                <span
                                  className="flex shrink-0 cursor-pointer items-center gap-1"
                                  onClick={() => toggleExpanded(entry.id)}>
                                  <IconShell size="sm" className="shrink-0">
                                    {isExpanded ? (
                                      <ChevronDown />
                                    ) : (
                                      <ChevronRight />
                                    )}
                                  </IconShell>
                                  <span className="text-fg-tertiary">
                                    {entry.timestamp}
                                  </span>
                                </span>
                                {!isExpanded && (
                                  <span className="text-fg-tertiary w-0 flex-1 truncate">
                                    {JSON.stringify(entry.data)}
                                  </span>
                                )}
                              </div>
                              {isExpanded && (
                                <pre className="text-fg-primary mt-1 break-all whitespace-pre-wrap">
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
      </ScrollArea>
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

  const traces = useSSEStream('/v1/broker/traces', 'default', {
    agentName: name,
  });
  const events = useSSEStream('/v1/broker/events', 'default', {
    agentName: name,
  });

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
        <div className="border-stroke-divider flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-4 py-3">
            <IconShell size="sm" variant="secondary">
              <ChatBubble />
            </IconShell>
            <span className="text-fg-primary text-sm font-medium">
              Chat with {name}
            </span>
          </div>
          <TabsList className="mx-4 mb-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <IconShell size="sm">
                <ChatBubble />
              </IconShell>
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <IconShell size="sm">
                <BugReport />
              </IconShell>
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
            <div className="text-fg-secondary flex flex-1 items-center justify-center text-sm">
              Checking broker availability...
            </div>
          )}
          {brokerStatus === 'not-installed' && (
            <div className="p-4">
              <Alert layout="long">
                <AlertIcon className="text-status-information">
                  <IconShell size="default">
                    <Info />
                  </IconShell>
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Broker service not available</AlertTitle>
                  <AlertDescription>
                    For the debug view to work, install the broker service and
                    turn on the setting in the experimental features window
                    (Ctrl+E).
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </div>
          )}
          {brokerStatus === 'not-running' && (
            <div className="p-4">
              <Alert layout="long">
                <AlertIcon className="text-status-error">
                  <IconShell size="default">
                    <ErrorIcon />
                  </IconShell>
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Broker service is not running</AlertTitle>
                  <AlertDescription>
                    The broker service is installed but is not currently running.
                  </AlertDescription>
                </AlertContent>
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
