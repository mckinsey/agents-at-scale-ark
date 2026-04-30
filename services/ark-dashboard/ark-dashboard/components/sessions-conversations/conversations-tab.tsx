'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { Conversation } from '@/lib/services/conversations';
import type { Participant } from '@/lib/services/participants';
import { sessionPendingMessagesAtom, sessionProcessingStateAtom } from '@/atoms/session-pending-messages';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageDisplay } from './message-display';
import { ChatInput } from './chat-input';
import { NewConversationDialog } from './new-conversation-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { generateUUID } from '@/lib/utils/uuid';

interface Props {
  readonly sessionId: string;
  readonly initialParticipant?: {
    name: string;
    type: 'agent' | 'team' | 'tool';
  };
  readonly initialConversationId?: string;
}

export function ConversationsTab({ sessionId, initialParticipant, initialConversationId }: Props) {
  const router = useRouter();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [temporaryConversations, setTemporaryConversations] = useState<Conversation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingMessagesMap, setPendingMessagesMap] = useAtom(sessionPendingMessagesAtom);
  const [processingStateMap, setProcessingStateMap] = useAtom(sessionProcessingStateAtom);
  const [hasSentMessage, setHasSentMessage] = useState(false);

  // Skip API call for new sessions before first message is sent
  const isNewSession = !!initialParticipant && !hasSentMessage;
  const { data: backendConversations, isLoading } = useListConversations(sessionId, {
    enabled: !isNewSession,
  });
  const { data: session } = useGetSession(sessionId, {
    enabled: !isNewSession,
  });

  useEffect(() => {
    if (initialParticipant && initialConversationId) {
      const tempConversation: Conversation = {
        conversationId: initialConversationId,
        name: initialParticipant.name,
        participants: [initialParticipant.name],
        messageCount: 0,
        toolCallCount: 0,
        duration: 'ongoing',
        status: 'active',
        startTime: new Date().toISOString(),
        isTemporary: true,
        participantType: initialParticipant.type,
      };
      setTemporaryConversations([tempConversation]);
      setSelectedConversationId(initialConversationId);
    }
  }, [initialParticipant, initialConversationId]);

  const allConversations = useMemo(() => {
    // If backend data hasn't loaded yet (undefined), keep all temporary conversations
    // This prevents the array from becoming empty during the initial fetch
    if (backendConversations === undefined) {
      return temporaryConversations;
    }

    // If backend returns empty while we have temporary conversations, keep temporary
    // This prevents flicker when backend hasn't processed the query yet
    if (backendConversations.length === 0 && temporaryConversations.length > 0) {
      return temporaryConversations;
    }

    const backend = backendConversations;
    const backendIds = new Set(backend.map(c => c.conversationId));
    const uniqueTemporary = temporaryConversations.filter(
      temp => !backendIds.has(temp.conversationId)
    );
    return [...uniqueTemporary, ...backend];
  }, [temporaryConversations, backendConversations]);

  const selectedConversation = useMemo(() => {
    return allConversations.find(c => c.conversationId === selectedConversationId) || null;
  }, [allConversations, selectedConversationId]);

  const handleSelectParticipant = (participant: Participant) => {
    const conversationId = generateUUID();
    const newConversation: Conversation = {
      conversationId,
      name: participant.name,
      participants: [participant.name],
      messageCount: 0,
      toolCallCount: 0,
      duration: 'ongoing',
      status: 'active',
      startTime: new Date().toISOString(),
      isTemporary: true,
      participantType: participant.type,
    };
    setTemporaryConversations((prev) => [...prev, newConversation]);
    setSelectedConversationId(conversationId);
  };

  const handleAddPendingMessage = (conversationId: string, content: string) => {
    const existing = pendingMessagesMap[conversationId] || [];
    setPendingMessagesMap(conversationId, [
      ...existing,
      { role: 'user' as const, content, timestamp: new Date().toISOString() },
    ]);
  };

  const handleClearPendingMessages = (conversationId: string) => {
    setPendingMessagesMap(conversationId, []);
    setProcessingStateMap(conversationId, false);
  };

  const handleEnableQueries = () => {
    setTemporaryConversations(prev =>
      prev.map(conv => ({ ...conv, isTemporary: false }))
    );
    // Enable API fetching now that first message has been sent
    setHasSentMessage(true);
  };

  const handleSetProcessing = (conversationId: string, isProcessing: boolean) => {
    setProcessingStateMap(conversationId, isProcessing);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex flex-1 flex-col space-y-4">
      {allConversations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No conversations yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-r border-border bg-muted p-4">
              <h3 className="text-sm font-medium">Conversations</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDialogOpen(true)}
                className="size-6"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 flex flex-col">
              <ConversationSidebar
                conversations={allConversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
            </div>
          </div>

          {selectedConversationId ? (
            <div className="flex h-full flex-col overflow-hidden">
              <MessageDisplay
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                pendingMessages={pendingMessagesMap[selectedConversationId] || []}
                onClearPending={() => handleClearPendingMessages(selectedConversationId)}
                isProcessing={processingStateMap[selectedConversationId] || false}
              />
              <ChatInput
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                onAddPendingMessage={handleAddPendingMessage}
                onSetProcessing={handleSetProcessing}
                onEnableQueries={handleEnableQueries}
              />
            </div>
          ) : (
            <Empty>
              <EmptyTitle>Select a conversation</EmptyTitle>
            </Empty>
          )}
        </div>
      )}

      <NewConversationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sessionParticipants={session?.participants || []}
        selectedConversation={selectedConversation}
        onSelectParticipant={handleSelectParticipant}
      />
    </div>
  );
}
