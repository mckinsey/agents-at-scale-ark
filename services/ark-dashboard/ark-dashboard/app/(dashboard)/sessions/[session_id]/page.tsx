'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Coins, MessageSquare, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';

interface Props {
  params: Promise<{
    session_id: string;
  }>;
}

export default function SessionDetailPage({ params }: Props) {
  const { session_id } = use(params);
  const router = useRouter();
  const { data: session, isLoading, isError } = useGetSession(session_id);

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
          Failed to load session details
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

  return (
    <div className="flex h-full flex-col space-y-6 p-8">
      <Button variant="ghost" onClick={() => router.push('/session-history')} className="w-fit cursor-pointer">
        <ArrowLeft className="mr-2 size-4" />
        Back to all sessions
      </Button>

      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{sessionDate}</div>
            <div className="flex items-center gap-4 text-sm">
              <h1 className="text-xl font-semibold">{session.sessionId}</h1>
              <div className="flex items-center gap-1">
                <Coins className="size-4 text-muted-foreground" />
                <span className="font-medium">{session.totalTokens.toLocaleString()}</span>
                <span className="text-muted-foreground">Tokens</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare className="size-4 text-muted-foreground" />
                <span className="font-medium">{session.conversationCount}</span>
                <span className="text-muted-foreground">Conversations</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="size-4 text-muted-foreground" />
                <span className="font-medium">{session.participants.length}</span>
                <span className="text-muted-foreground">Participants</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500" />
                <span className="font-medium">{session.errorCount}</span>
                <span className="text-muted-foreground">errors</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {session.participants.map(p => (
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
            variant={session.status === 'error' ? 'destructive' : session.status === 'active' ? 'default' : 'secondary'}
            className="capitalize"
          >
            {session.status}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="history" className="flex-1">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="flex-1">
          <ConversationsTab sessionId={session_id} />
        </TabsContent>

        <TabsContent value="logs" className="flex-1">
          <LogsTab sessionId={session_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
