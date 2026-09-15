'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { NumericBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import type { ParticipantType } from '@/lib/services/conversations';

type Participant = BrokerSession['participants'][number];

const TAG_GAP_PX = 8;
const BADGE_RESERVE_PX = 32;

interface Props {
  readonly session: BrokerSession;
  readonly isSelected: boolean;
  readonly onSelect: (sessionId: string) => void;
}

function ParticipantTag({ participant }: { readonly participant: Participant }) {
  return (
    <div className="flex h-7 min-w-0 items-center bg-fill-onsurface-ui-3">
      <div className="flex h-7 min-w-0 items-center px-2 hover:bg-stateslayer-overlay-hover">
        <div className="flex size-4 shrink-0 items-center justify-center">
          {getParticipantIcon(participant.type as ParticipantType)}
        </div>
        <div className="flex min-w-0 items-center gap-2 pl-2">
          <div className="truncate text-sm text-fg-primary">
            {stripNamespace(participant.name)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ParticipantTags({
  participants,
}: {
  readonly participants: readonly Participant[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(participants.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const ghost = ghostRef.current;
    if (!container || !ghost) return;

    const compute = () => {
      const available = container.clientWidth;
      const widths = Array.from(ghost.children).map(
        (el) => (el as HTMLElement).offsetWidth
      );

      const totalAll = widths.reduce(
        (sum, w, i) => sum + w + (i > 0 ? TAG_GAP_PX : 0),
        0
      );
      if (totalAll <= available) {
        setVisibleCount(participants.length);
        return;
      }

      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const next = used + (i > 0 ? TAG_GAP_PX : 0) + widths[i];
        if (next + TAG_GAP_PX + BADGE_RESERVE_PX <= available) {
          used = next;
          count += 1;
        } else {
          break;
        }
      }
      setVisibleCount(Math.max(count, 1));
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [participants]);

  const hiddenCount = participants.length - visibleCount;

  return (
    <div
      ref={containerRef}
      className="relative flex w-full items-center gap-2 overflow-hidden"
    >
      <div
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-2"
      >
        {participants.map((p) => (
          <ParticipantTag key={p.id} participant={p} />
        ))}
      </div>

      {participants.slice(0, visibleCount).map((p) => (
        <ParticipantTag key={p.id} participant={p} />
      ))}
      {hiddenCount > 0 && (
        <NumericBadge size="sm" variant="primary">
          {hiddenCount}
        </NumericBadge>
      )}
    </div>
  );
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

      <div className="flex items-center border-b border-stroke-tertiary h-14 min-w-0 overflow-hidden px-3">
        <ParticipantTags participants={session.participants} />
      </div>

      <div className="flex items-center justify-end border-b border-stroke-tertiary h-14 px-3">
        <div className="text-sm text-right text-fg-primary">{session.conversationCount}</div>
      </div>
    </button>
  );
}
