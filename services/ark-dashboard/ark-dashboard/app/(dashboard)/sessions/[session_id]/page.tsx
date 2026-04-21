'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAge } from '@/lib/utils/time';

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
        <Button variant="ghost" onClick={() => router.push('/sessions-conversations')}>
          <ArrowLeft className="mr-2 size-4" />
          Back to all sessions
        </Button>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Failed to load session details
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-6 p-8">
      <Button variant="ghost" onClick={() => router.push('/sessions-conversations')} className="w-fit">
        <ArrowLeft className="mr-2 size-4" />
        Back to all sessions
      </Button>

      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{session.sessionId}</h1>
              <Badge variant={session.status === 'error' ? 'destructive' : session.status === 'active' ? 'default' : 'secondary'}>
                {session.status}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatAge(session.createdAt)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 rounded-lg border p-6">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Tokens</div>
            <div className="text-3xl font-bold">{session.totalTokens.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Conversations</div>
            <div className="text-3xl font-bold">{session.conversationCount}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Participants</div>
            <div className="text-3xl font-bold">{session.participants.length}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Errors</div>
            <div className="text-3xl font-bold text-red-600">{session.errorCount}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Participants</div>
          <div className="flex flex-wrap gap-2">
            {session.participants.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
              >
                <span className="text-lg">
                  {p.type === 'agent' && '🤖'}
                  {p.type === 'team' && '👥'}
                  {p.type === 'tool' && '🔧'}
                </span>
                <span className="font-medium">{p.name}</span>
                {p.isActive && (
                  <span className="size-2 rounded-full bg-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="history" className="flex-1">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="flex-1">
          <div className="grid h-full grid-cols-[300px_1fr] gap-4">
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Conversations</h3>
                <Button variant="ghost" size="sm">+</Button>
              </div>
              <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
                Conversations list - Coming in Iteration 3
              </div>
            </div>

            <div className="flex flex-col rounded-lg border">
              <div className="flex-1 p-6">
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Messages panel - Coming in Iteration 3
                </div>
              </div>
              <div className="border-t p-4">
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  Chat input - Coming in Iteration 3
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="flex-1">
          <div className="flex h-full items-center justify-center rounded-lg border p-12 text-sm text-muted-foreground">
            Logs tab - Coming in Iteration 6
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
