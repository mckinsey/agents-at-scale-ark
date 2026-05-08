'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useParticipants } from '@/lib/services/participants-hooks';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import type { Participant } from '@/lib/services/participants';
import type { Participant as SessionParticipant } from '@/lib/services/broker-sessions';
import type { Conversation } from '@/lib/services/conversations';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sessionParticipants: SessionParticipant[];
  readonly selectedConversation: Conversation | null;
  readonly onSelectParticipant: (participant: Participant) => void;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  sessionParticipants,
  selectedConversation,
  onSelectParticipant,
}: Props) {
  const [search, setSearch] = useState('');
  const { data: allParticipants = [] } = useParticipants();

  const { inSession, filteredAllParticipants } = useMemo(() => {
    const sessionParticipantsList: Participant[] = sessionParticipants.map(p => ({
      name: p.name,
      type: p.type,
      description: null,
    }));

    const filteredSession = sessionParticipantsList.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    const filteredAll = allParticipants.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    return {
      inSession: filteredSession,
      filteredAllParticipants: filteredAll,
    };
  }, [sessionParticipants, allParticipants, search]);

  const handleSelect = (participant: Participant) => {
    onSelectParticipant(participant);
    onOpenChange(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start New Conversation</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search participants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[400px] space-y-4 overflow-y-auto">
            {inSession.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  In this session ({inSession.length})
                </h3>
                <div className="space-y-1">
                  {inSession.map((participant) => (
                      <Button
                        key={participant.name}
                        variant="ghost"
                        onClick={() => handleSelect(participant)}
                        className="h-auto w-full justify-start gap-3 p-3 text-left"
                      >
                        {getParticipantIcon(participant.type)}
                        <div className="flex-1 min-w-0 overflow-hidden space-y-1">
                          <div className="font-medium">{participant.name}</div>
                          {participant.description && (
                            <div className="w-full truncate text-xs text-muted-foreground">
                              {participant.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="flex-shrink-0 capitalize">
                          {participant.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {filteredAllParticipants.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    All participants ({filteredAllParticipants.length})
                  </h3>
                  <div className="space-y-1">
                    {filteredAllParticipants.map((participant) => (
                      <Button
                        key={participant.name}
                        variant="ghost"
                        onClick={() => handleSelect(participant)}
                        className="h-auto w-full justify-start gap-3 p-3 text-left"
                      >
                        {getParticipantIcon(participant.type)}
                        <div className="flex-1 min-w-0 overflow-hidden space-y-1">
                          <div className="font-medium">{participant.name}</div>
                          {participant.description && (
                            <div className="w-full truncate text-xs text-muted-foreground">
                              {participant.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="flex-shrink-0 capitalize">
                          {participant.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {filteredAllParticipants.length === 0 && inSession.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  No participants found
                </div>
              )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
