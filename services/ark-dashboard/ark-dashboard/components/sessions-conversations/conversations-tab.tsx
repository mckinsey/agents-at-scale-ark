'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { Plus } from 'lucide-react';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import { conversationsService } from '@/lib/services/conversations';
import type { Conversation } from '@/lib/services/conversations';
import type { Participant } from '@/lib/services/participants';
import { sessionPendingMessagesAtom } from '@/atoms/session-pending-messages';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageDisplay } from './message-display';
import { ChatInput } from './chat-input';
import { NewConversationDialog } from './new-conversation-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

interface Props {
  readonly sessionId: string;
}

interface TempSessionData {
  sessionId: string;
  conversationId: string;
  participants: Array<{
    name: string;
    type: 'agent' | 'team' | 'tool';
  }>;
  createdAt: string;
}

export function ConversationsTab({ sessionId }: Props) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [temporaryConversations, setTemporaryConversations] = useState<Conversation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingMessagesMap, setPendingMessagesMap] = useAtom(sessionPendingMessagesAtom);
  const [processingConversations, setProcessingConversations] = useState<Set<string>>(new Set());
  const [hasTempSession, setHasTempSession] = useState(() => {
    if (typeof globalThis.window === 'undefined') return false;
    return !!localStorage.getItem(`temp-session-${sessionId}`);
  });

  const { data: backendConversations, isLoading } = useListConversations(sessionId, { enabled: !hasTempSession });
  const { data: session } = useGetSession(sessionId);

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;

    const tempData = localStorage.getItem(`temp-session-${sessionId}`);
    if (!tempData) return;

    try {
      const parsedData: TempSessionData = JSON.parse(tempData);

      const participantNames = parsedData.participants.map(p => p.name).join(', ');
      const firstParticipant = parsedData.participants[0];

      const tempConversation: Conversation = {
        conversationId: parsedData.conversationId,
        name: participantNames,
        participantType: firstParticipant.type,
        participants: parsedData.participants.map(p => p.name),
        messageCount: 0,
        toolCallCount: 0,
        duration: '0s',
        status: 'active',
        startTime: parsedData.createdAt,
        isTemporary: true,
      };

      setTemporaryConversations([tempConversation]);
      setSelectedConversationId(parsedData.conversationId);
    } catch (error) {
      console.error('Failed to parse temporary session data:', error);
    }
  }, [sessionId]);

  const allConversations = useMemo(() => {
    const backend = backendConversations || [];
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
    const newConversation = conversationsService.createTemporaryConversation(
      participant.name,
      participant.type
    );
    setTemporaryConversations((prev) => [...prev, newConversation]);
    setSelectedConversationId(newConversation.conversationId);
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
    setProcessingConversations((prev) => {
      const newSet = new Set(prev);
      newSet.delete(conversationId);
      return newSet;
    });
  };

  const handleEnableQueries = () => {
    if (typeof globalThis.window !== 'undefined') {
      localStorage.removeItem(`temp-session-${sessionId}`);
      setHasTempSession(false);
      setTemporaryConversations(prev =>
        prev.map(conv => ({ ...conv, isTemporary: false }))
      );
    }
  };

  const handleSetProcessing = (conversationId: string, isProcessing: boolean) => {
    setProcessingConversations((prev) => {
      const newSet = new Set(prev);
      if (isProcessing) {
        newSet.add(conversationId);
      } else {
        newSet.delete(conversationId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allConversations.length === 0 ? (
        <div className="flex h-[600px] items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No conversations yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="grid h-[600px] grid-cols-[300px_1fr] gap-4">
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between px-2">
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
            <ConversationSidebar
              conversations={allConversations}
              selectedId={selectedConversationId}
              onSelect={setSelectedConversationId}
            />
          </div>

          {selectedConversationId ? (
            <div className="flex flex-col rounded-lg border">
              <MessageDisplay
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                pendingMessages={pendingMessagesMap[selectedConversationId] || []}
                onClearPending={() => handleClearPendingMessages(selectedConversationId)}
                isProcessing={processingConversations.has(selectedConversationId)}
                hasTempSession={hasTempSession}
              />
              <ChatInput
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                onAddPendingMessage={handleAddPendingMessage}
                onSetProcessing={handleSetProcessing}
                onEnableQueries={handleEnableQueries}
                hasTempSession={hasTempSession}
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
