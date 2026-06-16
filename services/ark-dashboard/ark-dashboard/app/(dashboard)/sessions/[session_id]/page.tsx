'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, MessageSquare, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { generateUUID } from '@/lib/utils/uuid';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import { cn } from '@/lib/utils';
import type { ParticipantType } from '@/lib/services/conversations';

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
  const sessionDate = `${dateStr} ${timeStr}`;

  const participants = session.participants || [];
  const conversationCount = session.conversationCount || 0;
  const errorCount = session.errorCount || 0;
  const sessionStatus = session.status;

  const getStatusClassName = (status: string) => {
    if (status === 'error') return 'border-red-500 text-white';
    if (status === 'active') return 'border-blue-500 text-blue-500';
    return 'border-border text-muted-foreground'; // idle
  };

  return (
    <div className="flex flex-col space-y-6 overflow-y-auto p-8">
      <button
        onClick={() => router.push('/session-history')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-4" />
        Back to all sessions
      </button>

      <div className="space-y-4 rounded-lg border bg-muted p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">{sessionDate}</div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <h1 className="text-xl font-semibold">{session_id}</h1>
              <div className="flex items-center gap-1">
                <MessageSquare className="size-4 text-muted-foreground" />
                <span className="font-medium">{conversationCount}</span>
                <span className="text-muted-foreground">Conversations</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="size-4 text-muted-foreground" />
                <span className="font-medium">{participants.length}</span>
                <span className="text-muted-foreground">Participants</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500" />
                <span className="font-medium">{errorCount}</span>
                <span className="text-muted-foreground">errors</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {participants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  {getParticipantIcon(p.type as ParticipantType)}
                  <span>{stripNamespace(p.name)}</span>
                </div>
              ))}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn('capitalize rounded-full', getStatusClassName(sessionStatus))}
          >
            {sessionStatus}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue={HISTORY_TAB} className="flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto gap-4">
          <TabsTrigger
            value={HISTORY_TAB}
            className="flex-none rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-6 pb-3 pt-0 text-muted-foreground shadow-none outline-none data-[state=active]:border-b-white data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-b-white dark:bg-transparent focus-visible:outline-none focus-visible:ring-0"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value={LOGS_TAB}
            className="flex-none rounded-none border-0 border-b-2 border-b-transparent bg-transparent px-6 pb-3 pt-0 text-muted-foreground shadow-none outline-none data-[state=active]:border-b-white data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-b-white dark:bg-transparent focus-visible:outline-none focus-visible:ring-0"
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
  );
}
