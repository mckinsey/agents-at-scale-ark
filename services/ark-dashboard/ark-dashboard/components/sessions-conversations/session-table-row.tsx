'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import type { ParticipantType } from '@/lib/services/conversations';

interface Props {
  readonly session: BrokerSession;
  readonly isSelected: boolean;
  readonly onSelect: (sessionId: string) => void;
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
        'grid grid-cols-[2fr_3fr_1fr_auto] gap-4 border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer',
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
          <div className="text-base font-semibold">
            {session.sessionId}
            {session.errorCount > 0 && (
              <Badge variant="destructive" className="ml-2 inline-flex h-5 items-center rounded px-1.5 text-xs align-middle">
                {session.errorCount}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{sessionTime}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {session.participants.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
          >
            {getParticipantIcon(p.type as ParticipantType)}
            <span>{stripNamespace(p.name)}</span>
          </div>
        ))}
        {session.participants.length > 3 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
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
