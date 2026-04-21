'use client';

import { useEffect, useRef } from 'react';
import { useGetMessages, useListConversations } from '@/lib/services/conversations-hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChatMessage } from '@/components/chat/chat-message';
import { Bot } from 'lucide-react';
import type { ConversationMessage } from '@/lib/services/conversations';

interface Props {
  conversationId: string;
  sessionId: string;
}

export function MessageDisplay({ conversationId, sessionId }: Props) {
  const { data: messages, isLoading } = useGetMessages(conversationId);
  const { data: conversations } = useListConversations(sessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations?.find(c => c.conversationId === conversationId);
  const participantName = conversation?.name || 'Participant';

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
          <Badge variant="outline">Agent</Badge>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages?.map((msg, idx) => (
          <ChatMessage
            key={idx}
            role={msg.message.role === 'tool' ? 'system' : msg.message.role}
            content={msg.message.content || ''}
            queryName={msg.query_id}
            toolCalls={msg.message.tool_calls}
            sender={msg.message.name}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
