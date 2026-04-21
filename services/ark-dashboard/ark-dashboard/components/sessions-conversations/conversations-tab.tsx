'use client';

import { useState } from 'react';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageDisplay } from './message-display';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface Props {
  sessionId: string;
}

export function ConversationsTab({ sessionId }: Props) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const { data: conversations, isLoading } = useListConversations(sessionId);

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!conversations || conversations.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No conversations yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid h-[600px] grid-cols-[300px_1fr] gap-4">
      <ConversationSidebar
        conversations={conversations}
        selectedId={selectedConversationId}
        onSelect={setSelectedConversationId}
      />

      {selectedConversationId ? (
        <div className="flex flex-col rounded-lg border">
          <MessageDisplay
            conversationId={selectedConversationId}
            sessionId={sessionId}
          />
          <ChatInput
            conversationId={selectedConversationId}
            sessionId={sessionId}
          />
        </div>
      ) : (
        <Empty>
          <EmptyTitle>Select a conversation</EmptyTitle>
        </Empty>
      )}
    </div>
  );
}
