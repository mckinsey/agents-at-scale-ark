'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ChevronLeft } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useListReturnHref } from '@/lib/hooks/use-list-return-href';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationsTab } from '@/components/sessions-conversations/conversations-tab';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';
import { SessionConversationHeader } from '@/components/sessions-conversations/session-conversation-header';

const HISTORY_TAB = 'history';
const LOGS_TAB = 'logs';

export default function SessionDetailPage() {
  const params = useParams();
  const session_id = params.session_id as string;
  const { push } = useNamespacedNavigation();

  const sessionsReturnHref = useListReturnHref('/sessions');

  const handleBackToSessions = useCallback(() => {
    push(sessionsReturnHref);
  }, [push, sessionsReturnHref]);

  const { data: session, isLoading, isError } = useGetSession(session_id);

  if (isLoading && !session) {
    return (
      <div className="flex h-full flex-col space-y-6 py-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col space-y-6 py-8">
        <button
          onClick={handleBackToSessions}
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
    <div className="flex flex-col gap-5">
      <button
        onClick={handleBackToSessions}
        className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer self-start"
      >
        <ChevronLeft className="size-4" />
        Back to all sessions
      </button>

      <SessionConversationHeader session={session} formattedDate={formattedDate} />

      <Tabs defaultValue={HISTORY_TAB} className="flex shrink-0 content-shell flex-col">
        <TabsList className="sticky top-0 z-20 shrink-0 justify-start items-center rounded-none border-b border-stroke-tertiary bg-surface-bg-base p-0 h-auto gap-3">
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

        <TabsContent
          value={HISTORY_TAB}
          className="flex min-h-0 flex-col h-[calc(100vh-104px)]"
        >
          <ConversationsTab sessionId={session_id} />
        </TabsContent>

        <TabsContent
          value={LOGS_TAB}
          className="flex min-h-0 flex-col h-[calc(100vh-104px)]"
        >
          <LogsTab sessionId={session_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
