'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Participant } from '@/lib/services/broker-sessions';

interface Props {
  participants: Participant[];
}

export function ParticipantsList({ participants }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? participants : participants.slice(0, 5);
  const remaining = participants.length - 5;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Participants</h3>
      <div className="flex flex-wrap gap-2">
        {visible.map(p => (
          <Badge key={p.id} variant="outline" className="gap-1">
            {p.type === 'agent' && '🤖'}
            {p.type === 'team' && '👥'}
            {p.type === 'tool' && '🔧'}
            {p.name}
            {p.isActive && (
              <span className="size-1.5 rounded-full bg-green-500" />
            )}
          </Badge>
        ))}
        {!expanded && remaining > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            +{remaining} more
          </Button>
        )}
      </div>
    </div>
  );
}
