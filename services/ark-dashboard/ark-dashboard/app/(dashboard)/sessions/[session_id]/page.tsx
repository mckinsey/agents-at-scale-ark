'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';
import { SessionConversationHeader } from '@/components/sessions-conversations/session-conversation-header';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { generateUUID } from '@/lib/utils/uuid';

const HISTORY_TAB = 'history';
const LOGS_TAB = 'logs';

export default function SessionDetailPage() {
  const params = useParams();
  const session_id = params.session_id as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialParticipant = searchParams.get('participant');
  const initialType = searchParams.get('type') as 'agent' | 'team' | 'tool' | null;
  const initialConversationId = searchParams.get('conversationId');

  const [hasSentMessage, setHasSentMessage] = useState(() => !initialParticipant);
  const isNewSession = !hasSentMessage;

  // Skip API call for new sessions (avoid 404 errors)
  const { data: backendSession, isLoading, isError } = useGetSession(session_id, {
    enabled: !isNewSession,
  });

  // Create temporary session from query params for new sessions
  const temporarySession = useMemo((): BrokerSession | null => {
    if (!initialParticipant || !initialType) {
      return null;
    }

    return {
      sessionId: session_id,
      name: session_id,
      status: 'active',
      errorCount: 0,
      participants: [{
        id: generateUUID(),
        name: initialParticipant,
        type: initialType,
      }],
      conversationCount: 0,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
  }, [initialParticipant, initialType, session_id]);

  const session = useMemo(() => {
    if (!backendSession) {
      return temporarySession;
    }

    // If backend has no participants but temporary session does, use temporary participants
    if (backendSession.participants.length === 0 && temporarySession?.participants.length) {
      return {
        ...backendSession,
        participants: temporarySession.participants,
      };
    }

    return backendSession;
  }, [backendSession, temporarySession]);

  const memoizedInitialParticipant = useMemo(() => {
    if (isNewSession && initialParticipant) {
      return {
        name: initialParticipant,
        type: initialType || 'agent' as const
      };
    }
    return undefined;
  }, [isNewSession, initialParticipant, initialType]);

  const memoizedInitialConversationId = useMemo(() => {
    return isNewSession ? initialConversationId || undefined : undefined;
  }, [isNewSession, initialConversationId]);

  if (isLoading && !session) {
    return (
      <div className="flex h-full flex-col space-y-6 p-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex h-full flex-col space-y-6 p-8">
        <button
          onClick={() => router.push('/session-history')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-4" />
          Back to all sessions
        </button>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {isError ? 'Failed to load session details' : 'Session not found'}
        </div>
      </div>
    );
  }

  const date = new Date(session.createdAt);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const formattedDate = `${dateStr} ${timeStr}`;

  return (
    <div className="flex flex-col space-y-6 p-8">
      <button
        onClick={() => router.push('/session-history')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-4" />
        Back to all sessions
      </button>

      <SessionConversationHeader session={session} formattedDate={formattedDate} />

      <div className="flex justify-start items-center overflow-hidden">
        <Tabs defaultValue={HISTORY_TAB} className="flex-1 max-w-[1344px] flex flex-col">
          <TabsList className="flex-1 justify-start items-center rounded-none border-b border-stroke-tertiary bg-transparent p-0 h-auto gap-3">
            <TabsTrigger
              value={HISTORY_TAB}
              className="flex-none rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 text-fg-secondary text-base font-normal leading-6 shadow-none outline-none data-[state=active]:border-b-stroke-active data-[state=active]:bg-transparent data-[state=active]:text-fg-primary data-[state=active]:font-normal data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-0"
            >
              History
            </TabsTrigger>
            <TabsTrigger
              value={LOGS_TAB}
              className="flex-none rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 text-fg-secondary text-base font-normal leading-6 shadow-none outline-none data-[state=active]:border-b-stroke-active data-[state=active]:bg-transparent data-[state=active]:text-fg-primary data-[state=active]:font-normal data-[state=active]:shadow-none focus-visible:outline-none focus-visible:ring-0"
            >
              Logs
            </TabsTrigger>
          </TabsList>

        <TabsContent value={HISTORY_TAB} className="flex flex-col">
          <ConversationsTab
            sessionId={session_id}
            initialParticipant={memoizedInitialParticipant}
            initialConversationId={memoizedInitialConversationId}
            hasSentMessage={hasSentMessage}
            onMessageSent={() => setHasSentMessage(true)}
          />
        </TabsContent>

          <TabsContent value={LOGS_TAB} className="flex flex-col">
            <LogsTab sessionId={session_id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
