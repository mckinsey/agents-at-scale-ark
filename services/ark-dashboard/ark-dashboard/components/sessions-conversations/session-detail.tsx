'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X } from 'lucide-react';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { ParticipantsList } from './participants-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationsTab } from './conversations-tab';
import { LogsTab } from './logs-tab';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function SessionDetail({ sessionId, onClose }: Props) {
  const { data: session, isLoading, isError } = useGetSession(sessionId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-96" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !session) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Failed to load session details
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{session.sessionId}</CardTitle>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={session.status === 'error' ? 'destructive' : 'default'}>
              {session.status}
            </Badge>
            {session.errorCount > 0 && (
              <Badge variant="destructive">{session.errorCount} errors</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {session.conversationCount} conversations • {session.totalTokens} tokens
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <ParticipantsList participants={session.participants} />

        <Tabs defaultValue="conversations">
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="conversations">
            <ConversationsTab sessionId={sessionId} />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab sessionId={sessionId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
