'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Conversation } from '@/lib/services/conversations';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageDisplay } from './message-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResourceErrorState } from '@/components/sections/resource-list-states';

const NO_CONVERSATIONS: Conversation[] = [];

interface Props {
  readonly sessionId: string;
}

export function ConversationsTab({ sessionId }: Props) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showToolCalls, setShowToolCalls] = useState(true);

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = useListConversations(sessionId);

  const allConversations = conversations ?? NO_CONVERSATIONS;

  useEffect(() => {
    if (!selectedConversationId && allConversations.length > 0) {
      setSelectedConversationId(allConversations[0].conversationId);
    }
  }, [allConversations, selectedConversationId]);

  const selectedConversation = useMemo(() => {
    return allConversations.find(c => c.conversationId === selectedConversationId) || null;
  }, [allConversations, selectedConversationId]);

  if (isLoading && allConversations.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError && allConversations.length === 0) {
    return (
      <ResourceErrorState
        className="mt-5"
        title="Failed to load conversations"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {allConversations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No conversations yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden"
          style={{ gridTemplateColumns: 'minmax(250px, 300px) minmax(min(400px, 50vw), 1fr)' }}
        >
          <div className="flex h-full flex-col border-r border-stroke-divider overflow-hidden">
            <div className="flex items-center h-14 bg-surface-bg-secondary px-5 py-2">
              <h3 className="text-sm font-semibold text-fg-primary">Conversations</h3>
            </div>
            <ScrollArea className="flex-1 h-0 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <ConversationSidebar
                conversations={allConversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
            </ScrollArea>
          </div>

          {selectedConversationId ? (
            <div className="flex h-full flex-col overflow-hidden border-b border-stroke-divider">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MessageDisplay
                  conversationId={selectedConversationId}
                  sessionId={sessionId}
                  conversation={selectedConversation}
                  showToolCalls={showToolCalls}
                  onShowToolCallsChange={setShowToolCalls}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden border-b border-stroke-divider">
              <div className="flex items-center justify-between h-14 bg-surface-bg-secondary pl-4">
                <h3 className="text-sm font-semibold text-fg-primary">No participant selected</h3>
              </div>
              <div className="flex flex-1 items-center justify-start flex-col gap-6 overflow-hidden bg-surface-bg-base p-4 outline outline-1 outline-offset-[-1px] outline-stroke-divider">
                <span className="inline-flex items-center justify-center gap-1 rounded-full bg-surface-bg-primary px-3 py-2 text-xs font-normal leading-4 tracking-tight text-fg-tertiary outline outline-1 outline-offset-[-1px] outline-stroke-divider">
                  Select a conversation to view its history
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
