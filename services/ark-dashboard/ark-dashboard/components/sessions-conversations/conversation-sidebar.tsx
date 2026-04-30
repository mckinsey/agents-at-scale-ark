'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Wrench, Clock, Bot, Users, Hammer } from 'lucide-react';
import type { Conversation } from '@/lib/services/conversations';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';

interface Props {
  readonly conversations: Conversation[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

function getParticipantIcon(participantType?: 'agent' | 'team' | 'tool', name?: string) {
  if (participantType === 'team') return <Users className="size-4" />;
  if (participantType === 'tool') return <Hammer className="size-4" />;
  if (participantType === 'agent') return <Bot className="size-4" />;

  if (name?.includes('team')) return <Users className="size-4" />;
  if (name?.includes('tool')) return <Hammer className="size-4" />;
  return <Bot className="size-4" />;
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

function formatDurationPill(duration: string): string {
  // Convert duration formats to simple minute format
  if (duration === 'ongoing') return '0min';

  // If already in format like "2 min" or "12min", return as is with normalization
  if (duration.includes('min')) {
    return duration.replace(' min', 'min');
  }

  // Otherwise return as is
  return duration;
}

export function ConversationSidebar({ conversations, selectedId, onSelect }: Props) {
  return (
    <div className="min-h-0 flex flex-col flex-1 space-y-3 overflow-y-auto border-r border-border">
      {conversations.map(conv => {
        const hasError = conv.status === 'error';
        const isActive = conv.status === 'active';
        const errorCount = hasError ? 2 : 0; // Placeholder - should come from data

        return (
          <button
            key={conv.conversationId}
            type="button"
            className={cn(
              'relative h-auto w-full flex flex-col items-start gap-2 px-4 py-3 text-left cursor-pointer transition-colors hover:bg-muted',
              selectedId === conv.conversationId && 'bg-muted',
              'border-l-2',
              hasError && 'border-l-red-500',
              isActive && !hasError && 'border-l-blue-500',
              !hasError && !isActive && 'border-l-border'
            )}
            onClick={() => onSelect(conv.conversationId)}
          >
            <div className="flex w-full items-center gap-2">
              {getParticipantIcon(conv.participantType, conv.name)}
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

            <div className="flex w-full items-center gap-2">
              <Badge variant="outline" className="rounded-md border-border text-xs px-2 py-0.5">
                {formatDurationPill(conv.duration)}
              </Badge>
              {hasError && errorCount > 0 && (
                <Badge variant="destructive" className="rounded-full text-xs size-5 flex items-center justify-center p-0">
                  {errorCount}
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
