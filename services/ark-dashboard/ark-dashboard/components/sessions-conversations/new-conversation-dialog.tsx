'use client';

import { useState, useMemo } from 'react';
import { Search, Bot, Users, Wrench } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Participant } from '@/lib/services/participants';
import type { Participant as SessionParticipant } from '@/lib/services/broker-sessions';
import type { Conversation } from '@/lib/services/conversations';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionParticipants: SessionParticipant[];
  selectedConversation: Conversation | null;
  onSelectParticipant: (participant: Participant) => void;
}

function getParticipantIcon(type: 'agent' | 'team' | 'tool') {
  if (type === 'agent') return <Bot className="size-4" />;
  if (type === 'team') return <Users className="size-4" />;
  if (type === 'tool') return <Wrench className="size-4" />;
  return <Bot className="size-4" />;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  sessionParticipants,
  selectedConversation,
  onSelectParticipant,
}: Props) {
  const [search, setSearch] = useState('');

  const { inConversation, allParticipants } = useMemo(() => {
    const conversationParticipants = new Set(selectedConversation?.participants || []);

    const sessionParticipantsList: Participant[] = sessionParticipants.map(p => ({
      name: p.name,
      type: p.type as 'agent' | 'team' | 'tool',
      description: null,
    }));

    const filtered = sessionParticipantsList.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    return {
      inConversation: filtered.filter(p => conversationParticipants.has(p.name)),
      allParticipants: filtered,
    };
  }, [sessionParticipants, selectedConversation, search]);

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

        <div className="space-y-4">
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
            {inConversation.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  In this conversation ({inConversation.length})
                </h3>
                <div className="space-y-1">
                  {inConversation.map((participant) => (
                      <Button
                        key={participant.name}
                        variant="ghost"
                        onClick={() => handleSelect(participant)}
                        className="h-auto w-full justify-start gap-3 p-3 text-left"
                      >
                        {getParticipantIcon(participant.type)}
                        <div className="flex-1 space-y-1">
                          <div className="font-medium">{participant.name}</div>
                          {participant.description && (
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {participant.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {participant.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {allParticipants.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    All participants ({allParticipants.length})
                  </h3>
                  <div className="space-y-1">
                    {allParticipants.map((participant) => (
                      <Button
                        key={participant.name}
                        variant="ghost"
                        onClick={() => handleSelect(participant)}
                        className="h-auto w-full justify-start gap-3 p-3 text-left"
                      >
                        {getParticipantIcon(participant.type)}
                        <div className="flex-1 space-y-1">
                          <div className="font-medium">{participant.name}</div>
                          {participant.description && (
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {participant.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {participant.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {allParticipants.length === 0 && (
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
