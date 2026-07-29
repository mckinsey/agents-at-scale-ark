'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtom } from 'jotai';
import { Plus } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { useListConversations } from '@/lib/services/conversations-hooks';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { Conversation } from '@/lib/services/conversations';
import type { Participant } from '@/lib/services/participants';
import type { Participant as SessionParticipant } from '@/lib/services/broker-sessions';
import { sessionPendingMessagesAtom, sessionProcessingStateAtom } from '@/atoms/session-pending-messages';
import { ConversationSidebar } from './conversation-sidebar';
import { MessageDisplay } from './message-display';
import { ChatInput } from './chat-input';
import { NewConversationPanel } from './new-conversation-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const closeNewConversationPanel = useCallback(() => {
    setIsCreatingConversation(false);
    requestAnimationFrame(() => createButtonRef.current?.focus());
  }, []);
  const [pendingMessagesMap, setPendingMessagesMap] = useAtom(sessionPendingMessagesAtom);
  const [processingStateMap, setProcessingStateMap] = useAtom(sessionProcessingStateAtom);
  const [showToolCalls, setShowToolCalls] = useState(true);

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

  // Auto-select first conversation if none is selected
  useEffect(() => {
    if (!selectedConversationId && allConversations.length > 0 && !initialConversationId) {
      setSelectedConversationId(allConversations[0].conversationId);
    }
  }, [allConversations, selectedConversationId, initialConversationId]);

  const selectedConversation = useMemo(() => {
    return allConversations.find(c => c.conversationId === selectedConversationId) || null;
  }, [allConversations, selectedConversationId]);

  // Targets already in this session: prefer backend session participants, falling back
  // to the targets of existing conversations so new sessions populate "In this session".
  const sessionTargets = useMemo<SessionParticipant[]>(() => {
    const targets = new Map<string, SessionParticipant>();
    for (const participant of session?.participants ?? []) {
      targets.set(participant.name, participant);
    }
    for (const conv of allConversations) {
      if (!targets.has(conv.name)) {
        targets.set(conv.name, {
          id: conv.name,
          name: conv.name,
          type: conv.participantType ?? 'agent',
        });
      }
    }
    return Array.from(targets.values());
  }, [session, allConversations]);

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
    closeNewConversationPanel();
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
            <div className="flex items-center justify-between h-14 bg-surface-bg-secondary px-5 py-2">
              <h3 className="text-sm font-semibold text-fg-primary">Conversations</h3>
              <Button
                ref={createButtonRef}
                variant="ghost"
                size="icon"
                onClick={() => setIsCreatingConversation(true)}
                className="size-6"
                aria-label="Create new conversation"
                title="Create new conversation"
                disabled={isCreatingConversation}
              >
                <IconShell size="sm" variant="secondary">
                  <Plus />
                </IconShell>
              </Button>
            </div>
            {isCreatingConversation ? (
              <NewConversationPanel
                sessionParticipants={sessionTargets}
                onSelectParticipant={handleSelectParticipant}
                onCancel={closeNewConversationPanel}
              />
            ) : (
              <ScrollArea className="flex-1 h-0 [&_[data-slot=scroll-area-viewport]>div]:!block">
                <ConversationSidebar
                  conversations={allConversations}
                  selectedId={selectedConversationId}
                  onSelect={setSelectedConversationId}
                />
              </ScrollArea>
            )}
          </div>

          {selectedConversationId ? (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <MessageDisplay
                  conversationId={selectedConversationId}
                  sessionId={sessionId}
                  conversation={selectedConversation}
                  pendingMessages={pendingMessagesMap[selectedConversationId] || []}
                  onClearPending={() => handleClearPendingMessages(selectedConversationId)}
                  isProcessing={processingStateMap[selectedConversationId] || false}
                  showToolCalls={showToolCalls}
                />
              </div>
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
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between h-14 bg-surface-bg-secondary pl-4">
                <h3 className="text-sm font-semibold text-fg-primary">No participant selected</h3>
              </div>
              <div className="flex flex-1 items-center justify-start flex-col gap-6 overflow-hidden bg-surface-bg-base p-4 outline outline-1 outline-offset-[-1px] outline-stroke-divider">
                <span className="inline-flex items-center justify-center gap-1 rounded-full bg-surface-bg-primary px-3 py-2 text-xs font-normal leading-4 tracking-tight text-fg-tertiary outline outline-1 outline-offset-[-1px] outline-stroke-divider">
                  Create a conversation to start
                </span>
              </div>
              <ChatInput
                conversationId=""
                sessionId={sessionId}
                conversation={null}
                onAddPendingMessage={handleAddPendingMessage}
                onSetProcessing={handleSetProcessing}
                onEnableQueries={handleEnableQueries}
                showToolCalls={showToolCalls}
                onShowToolCallsChange={setShowToolCalls}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
