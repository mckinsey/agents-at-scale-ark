'use client';

import { Badge } from '@/components/ui/badge';
import { Bot, Users, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import type { BrokerSession } from '@/lib/services/broker-sessions';

interface Props {
  readonly session: BrokerSession;
  readonly isSelected: boolean;
  readonly onSelect: (sessionId: string) => void;
}

function getParticipantIcon(type: string) {
  if (type === 'agent') return <Bot className="size-4" />;
  if (type === 'team') return <Users className="size-4" />;
  if (type === 'tool') return <Wrench className="size-4" />;
  return <Bot className="size-4" />;
}

export function SessionTableRow({ session, isSelected, onSelect }: Props) {
  const sessionTime = new Date(session.createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <button
      type="button"
      className={cn(
        'grid grid-cols-[2fr_3fr_1fr_auto] gap-4 border-b px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer',
        'w-full text-left',
        isSelected && 'bg-muted'
      )}
      onClick={() => onSelect(session.sessionId)}
      aria-pressed={isSelected}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            session.status === 'error' && 'bg-red-500',
            session.status === 'active' && 'bg-blue-500',
            session.status === 'idle' && 'bg-gray-400'
          )}
        />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{session.sessionId}</span>
            {session.errorCount > 0 && (
              <span className="flex h-5 items-center rounded border border-red-500 px-1.5 text-xs text-white">
                {session.errorCount}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{sessionTime}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {session.participants.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs"
          >
            {getParticipantIcon(p.type)}
            <span>{stripNamespace(p.name)}</span>
          </div>
        ))}
        {session.participants.length > 3 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-white text-xs font-medium text-black">
            {session.participants.length - 3}
          </span>
        )}
      </div>

      <div className="flex items-center text-sm">
        {session.conversationCount}
      </div>

      <div className="w-8" />
    </button>
  );
}
