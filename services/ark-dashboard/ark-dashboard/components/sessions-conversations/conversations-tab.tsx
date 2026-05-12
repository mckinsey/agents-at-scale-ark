'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { Plus, ChevronLeft, ChevronRight, Send } from 'lucide-react';
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
  readonly hasSentMessage?: boolean;
  readonly onMessageSent?: () => void;
}

export function ConversationsTab({ sessionId, initialParticipant, initialConversationId, hasSentMessage, onMessageSent }: Props) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [temporaryConversations, setTemporaryConversations] = useState<Conversation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingMessagesMap, setPendingMessagesMap] = useAtom(sessionPendingMessagesAtom);
  const [processingStateMap, setProcessingStateMap] = useAtom(sessionProcessingStateAtom);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);

  // Skip API call for new sessions before first message is sent
  const isNewSession = !!initialParticipant && !(hasSentMessage ?? false);
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
        startTime: new Date().toISOString(),
        isTemporary: true,
        participantType: initialParticipant.type,
        errorCount: 0,
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
      startTime: new Date().toISOString(),
      isTemporary: true,
      participantType: participant.type,
      errorCount: 0,
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
    onMessageSent?.();
  };

  const handleSetProcessing = (conversationId: string, isProcessing: boolean) => {
    setProcessingStateMap(conversationId, isProcessing);
  };

  if (isLoading && allConversations.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      {allConversations.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No conversations yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div
          className="grid min-h-[500px] max-h-[calc(100vh-20rem)] grid-rows-[minmax(0,1fr)] overflow-hidden transition-all duration-300"
          style={{ gridTemplateColumns: isSidebarCollapsed ? '48px 1fr' : 'minmax(250px, 300px) minmax(min(400px, 50vw), 1fr)' }}
        >
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-r border-border bg-muted p-4">
              {!isSidebarCollapsed && <h3 className="text-sm font-medium">Conversations</h3>}
              <div className="flex items-center gap-1">
                {!isSidebarCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDialogOpen(true)}
                    className="size-6"
                    aria-label="Create new conversation"
                    title="Create new conversation"
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="size-6"
                  title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isSidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                </Button>
              </div>
            </div>
            {!isSidebarCollapsed && (
              <div className="min-h-0 flex-1 flex flex-col">
                <ConversationSidebar
                  conversations={allConversations}
                  selectedId={selectedConversationId}
                  onSelect={setSelectedConversationId}
                />
              </div>
            )}
          </div>

          {selectedConversationId ? (
            <div className="flex h-full flex-col overflow-hidden border-r border-border">
              <MessageDisplay
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                pendingMessages={pendingMessagesMap[selectedConversationId] || []}
                onClearPending={() => handleClearPendingMessages(selectedConversationId)}
                isProcessing={processingStateMap[selectedConversationId] || false}
                showToolCalls={showToolCalls}
              />
              <ChatInput
                conversationId={selectedConversationId}
                sessionId={sessionId}
                conversation={selectedConversation}
                onAddPendingMessage={handleAddPendingMessage}
                onSetProcessing={handleSetProcessing}
                onEnableQueries={handleEnableQueries}
                showToolCalls={showToolCalls}
                onShowToolCallsChange={setShowToolCalls}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden border-r border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted p-4">
                <h3 className="text-sm font-medium">No participant selected</h3>
              </div>
              <div className="flex flex-1 items-center justify-center p-4">
                <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  Create a conversation to start
                </span>
              </div>
              <div className="border-b border-r border-t border-border">
                <div className="relative flex items-center gap-2 py-6 pl-6 pr-8 opacity-50 pointer-events-none">
                  <div className="flex-1 min-h-[48px] resize-none border-0 bg-transparent pt-6 pb-3 pr-16 text-sm text-muted-foreground">
                    Select a conversation to start messaging
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    disabled
                    className="absolute right-10 h-9 w-9"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
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
