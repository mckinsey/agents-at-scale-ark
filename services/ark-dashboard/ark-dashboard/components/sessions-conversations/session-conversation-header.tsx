'use client';

import { Badge, StatusBadge, NumericBadge } from '@/components/ui/badge';
import { Tag } from '@/components/ui/tag';
import { IconShell } from '@/components/ui/icon-shell';
import { Separator } from '@/components/ui/separator';
import { ChatBubble, Group } from '@/components/icons';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import { cn } from '@/lib/utils';
import type { ParticipantType } from '@/lib/services/conversations';
import type { BrokerSession } from '@/lib/services/broker-sessions';

interface SessionConversationHeaderProps {
  readonly session: BrokerSession;
  readonly formattedDate: string;
}

const MAX_VISIBLE_PARTICIPANTS = 5;

function getStatusBadgeVariant(status: string): 'brand-accent' | 'high-emphasis' | 'alternative' {
  if (status === 'active') return 'brand-accent';
  if (status === 'error') return 'high-emphasis';
  return 'alternative'; // idle
}

function getStatusBorderColor(status: string): string {
  if (status === 'error') return 'outline-status-error';
  if (status === 'active') return 'outline-status-information';
  return 'outline-stroke-tertiary'; // idle
}

export function SessionConversationHeader({ session, formattedDate }: SessionConversationHeaderProps) {
  const participants = session.participants || [];
  const conversationCount = session.conversationCount || 0;
  const errorCount = session.errorCount || 0;
  const sessionStatus = session.status;

  const visibleParticipants = participants.slice(0, MAX_VISIBLE_PARTICIPANTS);
  const remainingCount = Math.max(0, participants.length - MAX_VISIBLE_PARTICIPANTS);

  return (
    <div className="flex justify-start items-center overflow-hidden">
      <div className="flex-1 max-w-[1344px] p-5 bg-surface-bg-secondary outline outline-1 outline-offset-[-1px] outline-stroke-divider flex flex-col justify-center items-start gap-5">
        <div className="self-stretch flex justify-between items-start">
          <div className="flex justify-start items-end gap-3">
            <div className="flex flex-col justify-center items-start gap-1">
              <div className="text-fg-secondary text-xs font-normal leading-4 tracking-tight line-clamp-1">
                {formattedDate}
              </div>
              <div className="text-fg-primary text-xl font-semibold leading-7">
                {session.sessionId}
              </div>
            </div>
            <div className="flex justify-start items-center gap-6">
              <div className="flex justify-start items-center gap-2">
                <IconShell size="sm" variant="secondary">
                  <ChatBubble />
                </IconShell>
                <div className="flex justify-start items-center gap-1">
                  <div className="pb-0.5 flex justify-center items-center gap-1">
                    <div className="text-fg-primary text-base font-semibold leading-6 line-clamp-1">
                      {conversationCount}
                    </div>
                  </div>
                  <div className="text-fg-secondary text-sm font-normal leading-5 line-clamp-1">
                    Conversations
                  </div>
                </div>
              </div>
              <div className="flex justify-start items-center gap-2">
                <IconShell size="sm" variant="secondary">
                  <Group />
                </IconShell>
                <div className="flex justify-start items-center gap-1">
                  <div className="pb-0.5 flex justify-center items-center gap-1">
                    <div className="text-fg-primary text-base font-semibold leading-6 line-clamp-1">
                      {participants.length}
                    </div>
                  </div>
                  <div className="text-fg-secondary text-sm font-normal leading-5 line-clamp-1">
                    Participants
                  </div>
                </div>
              </div>
              <div className="w-px h-5 bg-stroke-divider shrink-0" />
              <div className="flex justify-start items-center gap-2">
                <StatusBadge variant="error" size="default" />
                <div className="flex justify-start items-center gap-1">
                  <div className="pb-0.5 flex justify-center items-center gap-1">
                    <div className="text-fg-primary text-base font-semibold leading-6 line-clamp-1">
                      {errorCount}
                    </div>
                  </div>
                  <div className="text-fg-secondary text-sm font-normal leading-5 line-clamp-1">
                    errors
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Badge
            variant={getStatusBadgeVariant(sessionStatus)}
            format="pill"
            outline
            className={cn('capitalize bg-transparent', getStatusBorderColor(sessionStatus))}
          >
            {sessionStatus}
          </Badge>
        </div>
        <div className="self-stretch flex justify-between items-center">
          <div className="flex justify-start items-center gap-2">
            {visibleParticipants.map(p => (
              <Tag
                key={p.id}
                variant="primary"
                size="default"
                disabled
                className="gap-1 cursor-default hover:no-underline text-fg-primary"
              >
                <IconShell size="sm" className="opacity-100">
                  {getParticipantIcon(p.type as ParticipantType)}
                </IconShell>
                <span className="text-fg-primary text-sm font-normal leading-5">
                  {stripNamespace(p.name)}
                </span>
              </Tag>
            ))}
            {remainingCount > 0 && (
              <NumericBadge variant="primary" size="sm">
                +{remainingCount}
              </NumericBadge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
