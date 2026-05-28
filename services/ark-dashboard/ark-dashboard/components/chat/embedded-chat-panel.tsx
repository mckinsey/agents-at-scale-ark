'use client';

import { Bug, Info, MessageCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { DebugStreamView } from '@/components/chat/debug-stream-view';
import { useSSEStream } from '@/components/chat/use-sse-stream';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { type BrokerStatus, proxyService } from '@/lib/services/proxy';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';
type DebugStreamType = 'traces' | 'events';

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
              <Alert layout="long">
                <AlertIcon className="text-status-information">
                  <Info className="text-[25px]" />
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
                  <XCircle className="text-[25px]" />
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
