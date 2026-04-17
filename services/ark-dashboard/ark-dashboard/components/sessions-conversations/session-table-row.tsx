'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { formatAge } from '@/lib/utils/time';

interface Props {
  session: BrokerSession;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
}

export function SessionTableRow({ session, isSelected, onSelect }: Props) {
  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
        isSelected && 'border-primary bg-muted'
      )}
      onClick={() => onSelect(session.sessionId)}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            session.status === 'error' && 'bg-red-500',
            session.status === 'active' && 'bg-blue-500',
            session.status === 'idle' && 'bg-gray-400'
          )}
        />
        {session.errorCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {session.errorCount}
          </Badge>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{session.sessionId}</div>
        <div className="flex flex-wrap gap-1 pt-1">
          {session.participants.slice(0, 3).map((p) => (
            <Badge key={p.id} variant="outline" className="text-xs">
              {p.type === 'agent' && '🤖'}
              {p.type === 'team' && '👥'}
              {p.type === 'tool' && '🔧'}
              {' '}{p.name}
              {p.isActive && <span className="ml-1 size-1.5 rounded-full bg-green-500" />}
            </Badge>
          ))}
          {session.participants.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{session.participants.length - 3} more
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <div>
          <div className="font-medium">{session.conversationCount}</div>
          <div className="text-xs">Conversations</div>
        </div>
        <div>
          <div className="font-medium">{session.totalTokens.toLocaleString()}</div>
          <div className="text-xs">Tokens</div>
        </div>
        <div>
          <div className="font-medium">{formatAge(session.lastActivity)}</div>
          <div className="text-xs">Last Activity</div>
        </div>
      </div>
    </div>
  );
}
