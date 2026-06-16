'use client';

import { Badge } from '@/components/ui/badge';
import { MessageSquare, Wrench } from 'lucide-react';
import type { Conversation } from '@/lib/services/conversations';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

interface Props {
  readonly conversations: Conversation[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

function formatAbsoluteTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function ConversationSidebar({ conversations, selectedId, onSelect }: Props) {
  return (
    <div className="min-h-0 flex flex-col flex-1 space-y-3 overflow-y-auto border-r border-border">
      {conversations.map(conv => {
        return (
          <button
            key={conv.conversationId}
            type="button"
            className={cn(
              'relative h-auto w-full flex flex-col items-start gap-2 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-muted',
              selectedId === conv.conversationId && 'bg-muted',
              'border-l-2 border-l-border'
            )}
            onClick={() => onSelect(conv.conversationId)}
          >
            <div className="flex w-full items-center gap-2">
              {getParticipantIcon(conv.participantType, { name: conv.name })}
              <span className="flex-1 truncate text-base font-medium">{stripNamespace(conv.name)}</span>
              <span className="text-sm text-muted-foreground">
                {formatAbsoluteTime(conv.startTime)}
              </span>
            </div>

            <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare className="size-3" />
                {conv.messageCount}
              </span>
              <span className="flex items-center gap-1">
                <Wrench className="size-3" />
                {conv.toolCallCount}
              </span>
            </div>

            {conv.errorCount > 0 && (
              <div className="flex w-full">
                <Badge variant="destructive" className="rounded text-xs px-1.5 py-0.5">
                  {conv.errorCount}
                </Badge>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
