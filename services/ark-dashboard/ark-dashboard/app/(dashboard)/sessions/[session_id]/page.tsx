'use client';

import { use, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bot, MessageSquare, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { generateUUID } from '@/lib/utils/uuid';

interface Props {
  readonly params: Promise<{
    session_id: string;
  }>;
}

export default function SessionDetailPage({ params }: Props) {
  const { session_id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialParticipant = searchParams.get('participant');
  const initialType = searchParams.get('type') as 'agent' | 'team' | 'tool' | null;
  const initialConversationId = searchParams.get('conversationId');
  const isNewSession = searchParams.get('isNew') === 'true';

  // Skip API call for new sessions (avoid 404 errors)
  const { data: backendSession, isLoading, isError } = useGetSession(session_id, {
    enabled: !isNewSession,
  });

  // Create temporary session from query params for new sessions
  const temporarySession = useMemo((): BrokerSession | null => {
    if (!isNewSession || !initialParticipant || !initialType) {
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
        isActive: true,
      }],
      conversationCount: 0,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
  }, [isNewSession, initialParticipant, initialType, session_id]);

  const session = isNewSession ? temporarySession : backendSession;

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

  if (isLoading) {
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
        <Button variant="ghost" onClick={() => router.push('/session-history')}>
          <ArrowLeft className="mr-2 size-4" />
          Back to all sessions
        </Button>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {isError ? 'Failed to load session details' : 'Session not found'}
        </div>
      </div>
    );
  }

  const sessionDate = new Date(session.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  function getParticipantIcon(type: string) {
    if (type === 'agent') return <Bot className="size-4" />;
    if (type === 'team') return <Users className="size-4" />;
    if (type === 'tool') return <Wrench className="size-4" />;
    return <Bot className="size-4" />;
  }

  const participants = session.participants || [];
  const conversationCount = session.conversationCount || 0;
  const errorCount = session.errorCount || 0;
  const sessionStatus = session.status;

  const getStatusVariant = (status: string) => {
    if (status === 'error') return 'destructive';
    if (status === 'active') return 'default';
    return 'secondary';
  };

  return (
    <div className="flex h-full flex-col space-y-6 p-8">
      <Button variant="ghost" onClick={() => router.push('/session-history')} className="w-fit cursor-pointer">
        <ArrowLeft className="mr-2 size-4" />
        Back to all sessions
      </Button>

      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
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
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                >
                  {getParticipantIcon(p.type)}
                  <span>{p.name}</span>
                  {p.isActive && (
                    <span className="size-2 rounded-full bg-blue-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <Badge
            variant={getStatusVariant(sessionStatus)}
            className="capitalize"
          >
            {sessionStatus}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="history" className="flex-1">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="flex-1">
          <ConversationsTab
            sessionId={session_id}
            initialParticipant={memoizedInitialParticipant}
            initialConversationId={memoizedInitialConversationId}
          />
        </TabsContent>

        <TabsContent value="logs" className="flex-1">
          <LogsTab sessionId={session_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
