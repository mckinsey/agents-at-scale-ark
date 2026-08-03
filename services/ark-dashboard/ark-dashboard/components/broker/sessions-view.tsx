'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  StreamPanel,
  StreamPlaceholder,
  StreamRow,
  useStreamPanelState,
} from '@/components/broker/stream-panel';
import { apiUrl } from '@/lib/api/config';

interface BrokerSession {
  readonly lastActivity?: string;
}

interface SessionsViewProps {
  readonly memory: string;
  readonly title?: string;
  readonly onPurged?: () => void;
}

export function SessionsView({
  memory,
  title = 'Sessions',
  onPurged,
}: Readonly<SessionsViewProps>) {
  const [sessions, setSessions] = useState<Record<string, BrokerSession>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    autoScroll,
    setAutoScroll,
    expandedIds,
    toggleExpanded,
    containerRef,
  } = useStreamPanelState(sessions);

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

  const sessionIds = Object.keys(sessions).sort(
    (a, b) =>
      new Date(sessions[b].lastActivity ?? 0).getTime() -
      new Date(sessions[a].lastActivity ?? 0).getTime(),
  );

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
      title={title}
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
          const { lastActivity } = sessions[sid];
          return (
            <StreamRow
              key={sid}
              label="session"
              isExpanded={expandedIds.has(sid)}
              onToggle={() => toggleExpanded(sid)}
              timestamp={
                lastActivity ? `${lastActivity.substring(0, 19)}Z` : undefined
              }
              summary={sid}
              payload={sessions[sid]}
            />
          );
        })
      )}
    </StreamPanel>
  );
}
