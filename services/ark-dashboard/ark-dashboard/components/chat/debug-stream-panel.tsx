'use client';

import { useEffect, useState } from 'react';

import { DebugStreamView } from '@/components/chat/debug-stream-view';
import { ErrorIcon, Info } from '@/components/icons';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useSSEStream } from '@/lib/hooks/use-sse-stream';
import { type BrokerStatus, proxyService } from '@/lib/services/proxy';

type DebugStreamType = 'traces' | 'events';

interface DebugStreamPanelProps {
  readonly name: string;
}

export function DebugStreamPanel({ name }: DebugStreamPanelProps) {
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

  if (brokerStatus === 'checking') {
    return (
      <div className="text-fg-secondary flex flex-1 items-center justify-center text-sm">
        Checking broker availability...
      </div>
    );
  }

  if (brokerStatus === 'not-installed') {
    return (
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
              For the debug view to work, install the broker service and turn on
              the setting in the experimental features window (Ctrl+E).
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  if (brokerStatus === 'not-running') {
    return (
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
    );
  }

  return (
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
      <TabsContent value="traces" className="mt-0 flex-1 overflow-hidden">
        <DebugStreamView
          entries={traces.entries}
          isConnected={traces.isConnected}
          isLoading={traces.isLoading}
          hasMore={traces.hasMore}
          error={traces.error}
          onLoadMore={traces.loadMore}
        />
      </TabsContent>
      <TabsContent value="events" className="mt-0 flex-1 overflow-hidden">
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
  );
}
