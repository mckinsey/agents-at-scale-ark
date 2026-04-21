'use client';

import { Button } from '@/components/ui/button';
import { MessageSquare, Wrench, DollarSign, Clock, Bot, Users, Hammer } from 'lucide-react';
import type { Conversation } from '@/lib/services/conversations';
import { cn } from '@/lib/utils';
import { formatAge } from '@/lib/utils/time';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getParticipantIcon(name: string) {
  if (name.includes('team')) return <Users className="size-4" />;
  if (name.includes('tool')) return <Hammer className="size-4" />;
  return <Bot className="size-4" />;
}

export function ConversationSidebar({ conversations, selectedId, onSelect }: Props) {
  return (
    <div className="space-y-2 overflow-y-auto">
      {conversations.map(conv => (
        <Button
          key={conv.conversationId}
          variant="ghost"
          className={cn(
            'h-auto w-full flex-col items-start gap-1.5 p-3 text-left cursor-pointer',
            selectedId === conv.conversationId && 'bg-accent'
          )}
          onClick={() => onSelect(conv.conversationId)}
        >
          <div className="flex w-full items-center gap-2">
            {getParticipantIcon(conv.name)}
            <span className="flex-1 truncate font-medium">{conv.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatAge(conv.startTime)}
            </span>
          </div>

          <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {conv.messageCount}
            </span>
            <span className="flex items-center gap-1">
              <Wrench className="size-3" />
              {conv.toolCallCount}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="size-3" />
              {conv.tokens}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {conv.duration}
            </span>
          </div>
        </Button>
      ))}
    </div>
  );
}
