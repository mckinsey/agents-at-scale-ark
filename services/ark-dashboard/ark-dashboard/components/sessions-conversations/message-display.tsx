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
}

function renderMessageContent(
  isTemporary: boolean,
  messages: unknown[] | undefined,
  participantName: string,
  messagesEndRef: React.RefObject<HTMLDivElement | null>
) {
  if (isTemporary && (!messages || messages.length === 0)) {
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

  if (messages && messages.length > 0) {
    return (
      <>
        {messages.map((msg: any) => (
          <ChatMessage
            key={msg.query_id}
            role={msg.message.role === 'tool' ? 'system' : msg.message.role}
            content={msg.message.content || ''}
            queryName={msg.query_id}
            toolCalls={msg.message.tool_calls}
            sender={msg.message.name}
          />
        ))}
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

export function MessageDisplay({ conversationId, sessionId, conversation }: Props) {
  const { data: messages, isLoading } = useGetMessages(sessionId, conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const isTemporary = conversation?.isTemporary || false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
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
        {renderMessageContent(isTemporary, messages, participantName, messagesEndRef)}
      </div>
    </div>
  );
}
