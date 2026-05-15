'use client';

import { Badge, NumericBadge } from '@/components/ui/badge';
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
        'grid grid-cols-[2fr_3fr_1fr] gap-4 transition-colors hover:bg-stateslayer-overlay-hover cursor-pointer',
        'w-full text-left',
        isSelected && 'bg-stateslayer-overlay-active'
      )}
      onClick={() => onSelect(session.sessionId)}
      aria-pressed={isSelected}
    >
      <div className="flex flex-col justify-center gap-0 border-b border-stroke-tertiary h-14 px-3">
        <div className="flex items-center gap-2">
          <div className="relative size-3">
            <span
              className={cn(
                'absolute left-[2px] top-[2px] size-2 rounded-full outline outline-1 outline-stroke-active-inverse',
                session.status === 'error' && 'bg-status-error',
                session.status === 'active' && 'bg-status-information',
                session.status === 'idle' && 'bg-fg-tertiary'
              )}
            />
          </div>
          <div className="text-sm text-fg-primary line-clamp-1">
            {session.sessionId}
          </div>
          {session.errorCount > 0 && (
            <div className="h-5 min-w-5 px-1 bg-fill-content-active-inverse rounded outline outline-[0.50px] outline-stroke-status-error inline-flex items-center justify-center gap-0.5">
              <div className="text-center text-xs text-fg-primary leading-4">{session.errorCount}</div>
            </div>
          )}
        </div>
        <div className="pl-5 flex items-center gap-1">
          <div className="text-xs text-fg-tertiary line-clamp-1">{sessionTime}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-stroke-tertiary h-14 px-3">
        {session.participants.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="h-7 bg-fill-onsurface-ui-3 flex items-center"
          >
            <div className="h-7 px-2 flex items-center hover:bg-stateslayer-overlay-hover">
              <div className="size-4 flex items-center justify-center">
                {getParticipantIcon(p.type as ParticipantType)}
              </div>
              <div className="pl-2 flex items-center gap-2">
                <div className="text-sm text-fg-primary line-clamp-1">{stripNamespace(p.name)}</div>
              </div>
            </div>
          </div>
        ))}
        {session.participants.length > 3 && (
          <NumericBadge size="sm" variant="primary">
            {session.participants.length - 3}
          </NumericBadge>
        )}
      </div>

      <div className="flex items-center justify-end border-b border-stroke-tertiary h-14 px-3">
        <div className="text-sm text-right text-fg-primary">{session.conversationCount}</div>
      </div>
    </button>
  );
}
