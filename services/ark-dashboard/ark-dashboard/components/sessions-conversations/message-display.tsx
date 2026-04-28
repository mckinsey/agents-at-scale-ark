'use client';

import { useEffect, useRef } from 'react';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChatMessage } from '@/components/chat/chat-message';
import { Bot } from 'lucide-react';

const FALLBACK_PARTICIPANT_NAME = 'Participant';
const FALLBACK_PARTICIPANT_TYPE = 'agent';

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>;
  readonly onClearPending: () => void;
  readonly isProcessing: boolean;
  readonly hasTempSession: boolean;
}

function renderMessageContent(
  isTemporary: boolean,
  messages: unknown[] | undefined,
  pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>,
  participantName: string,
  messagesEndRef: React.RefObject<HTMLDivElement | null>,
  isProcessing: boolean
) {
  const hasBackendMessages = messages && messages.length > 0;

  const backendUserMessages = hasBackendMessages
    ? new Set(
        messages
          .filter((msg: any) => msg.message.role === 'user')
          .map((msg: any) => msg.message.content?.trim())
      )
    : new Set();

  const uniquePendingMessages = pendingMessages.filter(
    pending => !backendUserMessages.has(pending.content.trim())
  );

  const hasPendingMessages = uniquePendingMessages.length > 0;

  if (isTemporary && !hasBackendMessages && !hasPendingMessages) {
    return (
      <div className="flex h-full items-center justify-center text-center text-muted-foreground">
        <div>
          <p className="mb-2 text-sm">Conversation started with {participantName}</p>
          <p className="text-xs">
            Send a message below to begin the conversation
          </p>
        </div>
      </div>
    );
  }

  if (hasBackendMessages || hasPendingMessages) {
    return (
      <>
        {hasBackendMessages && messages.map((msg: any) => (
          <ChatMessage
            key={`${msg.query_id}-${msg.sequence}`}
            role={msg.message.role === 'tool' ? 'system' : msg.message.role}
            content={msg.message.content || ''}
            queryName={msg.query_id}
            toolCalls={msg.message.tool_calls}
            sender={msg.message.name}
          />
        ))}
        {hasPendingMessages && uniquePendingMessages.map((msg, idx) => (
          <ChatMessage
            key={`pending-${msg.timestamp}-${idx}`}
            role="user"
            content={msg.content}
          />
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-muted max-w-[80%] rounded-lg px-3 py-2">
              <div className="flex space-x-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: '0.1s' }}></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-center text-muted-foreground">
      <div>
        <p className="mb-2 text-sm">No conversation messages available</p>
        <p className="text-xs">
          Workflow sessions don't have conversational messages. Check the Logs tab for execution details.
        </p>
      </div>
    </div>
  );
}

export function MessageDisplay({ conversationId, sessionId, conversation, pendingMessages, onClearPending, isProcessing, hasTempSession }: Props) {
  const { data: messages, isLoading } = useGetMessages(sessionId, conversationId, { enabled: !hasTempSession });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const isTemporary = conversation?.isTemporary || false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages]);

  useEffect(() => {
    if (messages && messages.length > previousMessageCountRef.current && isProcessing) {
      const hasAgentResponse = messages.some((msg: any) =>
        msg.message.role === 'assistant' || msg.message.role === 'tool'
      );
      if (hasAgentResponse) {
        onClearPending();
      }
    }
    previousMessageCountRef.current = messages?.length || 0;
  }, [messages, isProcessing, onClearPending]);

  if (isLoading && pendingMessages.length === 0) {
    return <Skeleton className="flex-1" />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Bot className="size-5" />
          <span className="font-semibold">{participantName}</span>
          <Badge variant="outline" className="capitalize">{participantType}</Badge>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {renderMessageContent(isTemporary, messages, pendingMessages, participantName, messagesEndRef, isProcessing)}
      </div>
    </div>
  );
}
