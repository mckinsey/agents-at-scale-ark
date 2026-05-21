'use client';

import { Badge } from '@/components/ui/badge';
import { ChatBubble, Handyman, Schedule } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import type { Conversation } from '@/lib/services/conversations';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

interface Props {
  readonly conversations: Conversation[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

type ConversationStatus = 'error' | 'active' | 'completed';

function getConversationStatus(conv: Conversation): ConversationStatus {
  if (conv.errorCount > 0) return 'error';
  if (conv.duration === 'ongoing') return 'active';
  return 'completed';
}

function getStatusBorderClass(status: ConversationStatus): string {
  const borderColors = {
    error: 'bg-stroke-status-error',
    active: 'bg-stroke-status-focus',
    completed: 'bg-stroke-status-mono',
  };
  return borderColors[status];
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
    <div className="flex flex-col gap-2 pr-3 py-3" data-testid="conversation-sidebar">
      {conversations.map(conv => {
        const status = getConversationStatus(conv);
        const isSelected = selectedId === conv.conversationId;

        return (
          <button
            key={conv.conversationId}
            type="button"
            data-testid="conversation-item"
            className={cn(
              'relative h-auto w-full flex justify-start items-start text-left cursor-pointer transition-colors',
              isSelected && 'bg-stateslayer-overlay-hover',
              !isSelected && 'hover:bg-stateslayer-overlay-hover'
            )}
            onClick={() => onSelect(conv.conversationId)}
          >
            <div className={cn('w-px self-stretch', getStatusBorderClass(status))} />
            <div className="flex-1 px-3 py-2 flex flex-col justify-start items-start gap-3">
              <div className="self-stretch flex justify-between items-center">
                <div className="flex justify-start items-center gap-1">
                  <IconShell size="sm" className="opacity-100">
                    {getParticipantIcon(conv.participantType, { name: conv.name, size: '4' })}
                  </IconShell>
                  <span
                    className="text-sm font-normal leading-5 line-clamp-1 text-fg-primary"
                    data-testid="conversation-participant-name"
                  >
                    {stripNamespace(conv.name)}
                  </span>
                </div>
                <span className="text-xs font-normal leading-4 text-fg-secondary">
                  {formatAbsoluteTime(conv.startTime)}
                </span>
              </div>

              <div className="flex justify-start items-center gap-2">
                <span className="flex justify-start items-center gap-1">
                  <IconShell size="sm" variant="secondary">
                    <ChatBubble />
                  </IconShell>
                  <span className="text-xs font-normal leading-4 text-fg-primary line-clamp-1">
                    {conv.messageCount}
                  </span>
                </span>
                <span className="flex justify-start items-center gap-1">
                  <IconShell size="sm" variant="secondary">
                    <Handyman />
                  </IconShell>
                  <span className="text-xs font-normal leading-4 text-fg-primary line-clamp-1">
                    {conv.toolCallCount}
                  </span>
                </span>
                {conv.duration !== 'ongoing' && (
                  <span className="flex justify-start items-center gap-1">
                    <IconShell size="sm" variant="secondary">
                      <Schedule />
                    </IconShell>
                    <span className="text-xs font-normal leading-4 text-fg-primary line-clamp-1">
                      {conv.duration}
                    </span>
                  </span>
                )}
              </div>

              {status === 'error' && conv.errorCount > 0 && (
                <Badge variant="error" outline size="sm" format="rect">
                  {conv.errorCount}
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
