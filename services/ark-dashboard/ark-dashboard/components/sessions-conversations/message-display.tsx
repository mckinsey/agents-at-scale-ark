'use client';

import { useEffect, useRef, memo } from 'react';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import type { Conversation, ConversationMessage } from '@/lib/services/conversations';
import type { ChatMessage } from '@/lib/types/chat-message';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SessionMessage } from './session-message';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

const FALLBACK_PARTICIPANT_NAME = 'Participant';
const FALLBACK_PARTICIPANT_TYPE = 'agent';

type ToolCall = NonNullable<ChatMessage['tool_calls']>[number];
type EnhancedToolCall = ToolCall & { result?: string };

interface EnhancedChatMessage extends Omit<ChatMessage, 'tool_calls' | 'role'> {
  role: 'user' | 'assistant' | 'system';
  tool_calls?: EnhancedToolCall[];
}

interface EnhancedConversationMessage extends Omit<ConversationMessage, 'message'> {
  message: EnhancedChatMessage;
}

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>;
  readonly onClearPending: () => void;
  readonly isProcessing: boolean;
  readonly showToolCalls: boolean;
}

function enhanceMessagesWithToolResults(messages: ConversationMessage[]): EnhancedConversationMessage[] {
  // Build a map of tool_call_id -> tool result content
  const toolResults = new Map<string, string>();
  messages.forEach(msg => {
    if (msg.message?.role === 'tool' && msg.message?.tool_call_id && msg.message?.content) {
      toolResults.set(msg.message.tool_call_id, msg.message.content);
    }
  });

  // Filter out tool messages and enhance tool_calls with results
  return messages
    .filter(msg => msg.message?.role !== 'tool')  // Skip tool response messages
    .map(msg => {
      // If message has tool_calls, add results to them
      if (msg.message?.tool_calls && Array.isArray(msg.message.tool_calls)) {
        const enhancedToolCalls: EnhancedToolCall[] = msg.message.tool_calls.map(tc => ({
          ...tc,
          result: toolResults.get(tc.id)
        }));
        return {
          ...msg,
          message: {
            ...msg.message,
            role: msg.message.role as 'user' | 'assistant' | 'system',
            tool_calls: enhancedToolCalls
          }
        };
      }
      return {
        ...msg,
        message: {
          ...msg.message,
          role: msg.message.role as 'user' | 'assistant' | 'system'
        }
      };
    });
}

interface MessageContentProps {
  readonly isTemporary: boolean;
  readonly messages: ConversationMessage[] | undefined;
  readonly pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>;
  readonly participantName: string;
  readonly isProcessing: boolean;
  readonly showToolCalls: boolean;
}

const MessageContent = memo(function MessageContent({
  isTemporary,
  messages,
  pendingMessages,
  participantName,
  isProcessing,
  showToolCalls
}: MessageContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages]);

  const processedMessages = messages && messages.length > 0
    ? enhanceMessagesWithToolResults(messages)
    : [];

  const hasBackendMessages = processedMessages.length > 0;

  const backendUserMessages = hasBackendMessages
    ? new Set(
        processedMessages
          .filter(msg => msg.message.role === 'user')
          .map(msg => msg.message.content?.trim())
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
        {hasBackendMessages && processedMessages.map(msg => (
          <SessionMessage
            key={`${msg.query_id}-${msg.sequence}`}
            role={msg.message.role}
            content={msg.message.content || ''}
            toolCalls={msg.message.tool_calls}
            sender={msg.message.name}
            timestamp={msg.timestamp}
            showToolCalls={showToolCalls}
          />
        ))}
        {hasPendingMessages && uniquePendingMessages.map((msg, idx) => (
          <SessionMessage
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
});

export function MessageDisplay({ conversationId, sessionId, conversation, pendingMessages, onClearPending, isProcessing, showToolCalls }: Props) {
  const { data: messages, isLoading } = useGetMessages(sessionId, conversationId);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const isTemporary = conversation?.isTemporary || false;

  useEffect(() => {
    // Clear processing only when agent response appears after pending user message
    if (!isProcessing || !messages || messages.length === 0 || pendingMessages.length === 0) {
      return;
    }

    // Find the user message in backend that matches the last pending message
    const lastPendingContent = pendingMessages.at(-1)?.content.trim();
    if (!lastPendingContent) {
      return;
    }

    // Find the backend user message with matching content
    const userMessageInBackend = messages
      .filter(msg => msg.message.role === 'user')
      .find(msg => msg.message.content?.trim() === lastPendingContent);

    if (!userMessageInBackend) {
      return;
    }

    // Check if there's an assistant message with a higher sequence number
    const assistantMessages = messages.filter(msg => {
      const isAssistant = msg.message.role === 'assistant';
      const isAfterUser = msg.sequence > userMessageInBackend.sequence;
      return isAssistant && isAfterUser;
    });

    if (assistantMessages.length > 0) {
      onClearPending();
    }
  }, [messages, pendingMessages, isProcessing, onClearPending]);

  if (isLoading && pendingMessages.length === 0) {
    return <Skeleton className="flex-1" />;
  }

  return (
    <div className="min-h-0 flex flex-1 flex-col">
      <div className="border-b border-border bg-muted p-4">
        <div className="flex items-center gap-2">
          {getParticipantIcon(participantType, { size: '4' })}
          <span className="font-semibold">{stripNamespace(participantName)}</span>
          <Badge className="border-0 bg-muted/50 capitalize text-muted-foreground">{participantType}</Badge>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <MessageContent
          isTemporary={isTemporary}
          messages={messages}
          pendingMessages={pendingMessages}
          participantName={participantName}
          isProcessing={isProcessing}
          showToolCalls={showToolCalls}
        />
      </div>
    </div>
  );
}
