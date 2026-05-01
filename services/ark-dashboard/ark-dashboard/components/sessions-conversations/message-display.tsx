'use client';

import { useEffect, useRef } from 'react';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SessionMessage } from './session-message';
import { Bot, Users, Hammer } from 'lucide-react';
import { stripNamespace } from '@/lib/utils/participant';

const FALLBACK_PARTICIPANT_NAME = 'Participant';
const FALLBACK_PARTICIPANT_TYPE = 'agent';

function getParticipantIcon(participantType?: 'agent' | 'team' | 'tool') {
  if (participantType === 'team') return <Users className="size-5" />;
  if (participantType === 'tool') return <Hammer className="size-5" />;
  return <Bot className="size-5" />;
}

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>;
  readonly onClearPending: () => void;
  readonly isProcessing: boolean;
}

function enhanceMessagesWithToolResults(messages: any[]): any[] {
  // Build a map of tool_call_id -> tool result content
  const toolResults = new Map<string, string>();
  messages.forEach(msg => {
    if (msg.message?.role === 'tool' && msg.message?.tool_call_id) {
      toolResults.set(msg.message.tool_call_id, msg.message.content);
    }
  });

  // Filter out tool messages and enhance tool_calls with results
  return messages
    .filter(msg => msg.message?.role !== 'tool')  // Skip tool response messages
    .map(msg => {
      // If message has tool_calls, add results to them
      if (msg.message?.tool_calls && Array.isArray(msg.message.tool_calls)) {
        const enhancedToolCalls = msg.message.tool_calls.map((tc: any) => ({
          ...tc,
          result: toolResults.get(tc.id) || tc.result  // Use existing result if no match
        }));
        return {
          ...msg,
          message: {
            ...msg.message,
            tool_calls: enhancedToolCalls
          }
        };
      }
      return msg;
    });
}

function renderMessageContent(
  isTemporary: boolean,
  messages: unknown[] | undefined,
  pendingMessages: Array<{ role: 'user'; content: string; timestamp: string }>,
  participantName: string,
  messagesEndRef: React.RefObject<HTMLDivElement | null>,
  isProcessing: boolean
) {
  // Process messages to enhance tool calls with results and filter out tool response messages
  const processedMessages = messages && messages.length > 0
    ? enhanceMessagesWithToolResults(messages as any[])
    : [];

  const hasBackendMessages = processedMessages.length > 0;

  const backendUserMessages = hasBackendMessages
    ? new Set(
        processedMessages
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
        {hasBackendMessages && processedMessages.map((msg: any) => (
          <SessionMessage
            key={`${msg.query_id}-${msg.sequence}`}
            role={msg.message.role}
            content={msg.message.content || ''}
            toolCalls={msg.message.tool_calls}
            sender={msg.message.name}
            timestamp={msg.created_at || msg.timestamp}
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
}

export function MessageDisplay({ conversationId, sessionId, conversation, pendingMessages, onClearPending, isProcessing }: Props) {
  const { data: messages, isLoading } = useGetMessages(sessionId, conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const isTemporary = conversation?.isTemporary || false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages]);

  useEffect(() => {
    // Clear processing only when agent response appears after pending user message
    if (!isProcessing || !messages || messages.length === 0 || pendingMessages.length === 0) {
      return;
    }

    // Find the user message in backend that matches the last pending message
    const lastPendingContent = pendingMessages[pendingMessages.length - 1]?.content.trim();
    if (!lastPendingContent) {
      return;
    }

    // Find the backend user message with matching content
    const userMessageInBackend = messages
      .filter((msg: any) => msg.message.role === 'user')
      .find((msg: any) => msg.message.content?.trim() === lastPendingContent);

    if (!userMessageInBackend) {
      return;
    }

    // Check if there's an assistant message with a higher sequence number
    const assistantMessages = messages.filter((msg: any) => {
      const isAssistant = msg.message.role === 'assistant' || msg.message.role === 'agent';
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
          {getParticipantIcon(participantType)}
          <span className="font-semibold">{stripNamespace(participantName)}</span>
          <Badge className="border-0 bg-muted/50 capitalize text-muted-foreground">{participantType}</Badge>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {renderMessageContent(isTemporary, messages, pendingMessages, participantName, messagesEndRef, isProcessing)}
      </div>
    </div>
  );
}
