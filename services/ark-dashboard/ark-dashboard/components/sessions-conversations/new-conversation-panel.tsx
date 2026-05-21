'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search } from '@/components/icons/Search';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useParticipants } from '@/lib/services/participants-hooks';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import type { Participant } from '@/lib/services/participants';
import type { Participant as SessionParticipant } from '@/lib/services/broker-sessions';

interface Props {
  readonly sessionParticipants: SessionParticipant[];
  readonly onSelectParticipant: (participant: Participant) => void;
  readonly onCancel: () => void;
}

export function NewConversationPanel({
  sessionParticipants,
  onSelectParticipant,
  onCancel,
}: Props) {
  const [search, setSearch] = useState('');
  const { data: allParticipants = [] } = useParticipants();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const { inSession, filteredAllParticipants } = useMemo(() => {
    const sessionParticipantsList: Participant[] = sessionParticipants.map(p => ({
      name: p.name,
      type: p.type,
      description: null,
    }));

    const query = search.toLowerCase();
    const matches = (name: string) =>
      name.toLowerCase().includes(query) ||
      stripNamespace(name).toLowerCase().includes(query);

    const filteredSession = sessionParticipantsList.filter(p => matches(p.name));
    const filteredAll = allParticipants.filter(p => matches(p.name));

    return {
      inSession: filteredSession,
      filteredAllParticipants: filteredAll,
    };
  }, [sessionParticipants, allParticipants, search]);

  const handleSelect = (participant: Participant) => {
    onSelectParticipant(participant);
    setSearch('');
  };

  const renderListItem = (participant: Participant) => (
    <button
      key={`${participant.type}-${participant.name}`}
      type="button"
      onClick={() => handleSelect(participant)}
      className="text-fg-secondary hover:bg-stateslayer-overlay-hover flex w-full items-center gap-2 py-2 pr-2 pl-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stroke-status-focus"
    >
      <IconShell size="sm" variant="secondary">
        {getParticipantIcon(participant.type)}
      </IconShell>
      <span className="truncate text-sm tracking-[-0.028px]">
        {stripNamespace(participant.name)}
      </span>
    </button>
  );

  const renderSection = (title: string, items: Participant[]) => {
    if (items.length === 0) return null;

    return (
      <div className="flex w-full flex-col gap-1">
        <div className="text-fg-tertiary flex items-center gap-1 text-sm tracking-[-0.112px]">
          <span>{title}</span>
          <span>({items.length})</span>
        </div>
        <div className="flex flex-col">
          {items.map(renderListItem)}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="new-conversation-panel"
      className="bg-surface-bg-primary flex h-full flex-col px-3 pt-3 pb-3"
    >
      <InputGroup>
        <InputGroupAddon>
          <IconShell size="sm" variant="secondary">
            <Search />
          </IconShell>
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search participants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search participants"
          autoFocus
        />
      </InputGroup>

      <ScrollArea className="-mx-3 mt-4 min-h-0 flex-1">
        <div className="flex flex-col gap-[30px] px-3">
          {renderSection('In this session', inSession)}
          {renderSection('All participants', filteredAllParticipants)}
          {inSession.length === 0 && filteredAllParticipants.length === 0 && (
            <div className="text-fg-tertiary py-8 text-center text-sm">
              No participants found
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex justify-end pt-4">
        <Button variant="outline" onClick={onCancel} className="min-w-[92px]">
          Cancel
        </Button>
      </div>
    </div>
  );
}
