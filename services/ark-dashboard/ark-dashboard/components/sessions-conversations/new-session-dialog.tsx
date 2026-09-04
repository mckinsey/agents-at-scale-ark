'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TagToggle } from '@/components/ui/tag-toggle';
import { Separator } from '@/components/ui/separator';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Check } from '@/components/icons/check';
import { Search } from '@/components/icons/search';
import { Close } from '@/components/icons/close';
import { useQuery } from '@tanstack/react-query';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { agentsService } from '@/lib/services/agents';
import { teamsService } from '@/lib/services/teams';
import { toolsService } from '@/lib/services/tools';
import { cn } from '@/lib/utils';
import { stripNamespace } from '@/lib/utils/participant';
import { generateUUID } from '@/lib/utils/uuid';
import type { ParticipantType } from '@/lib/services/conversations';
import { useNamespace } from '@/providers/NamespaceProvider';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface UnifiedParticipant {
  name: string;
  type: ParticipantType;
  description?: string | null;
}

type TabFilter = 'all' | 'agents' | 'teams' | 'tools';

const FILTERS: { readonly label: string; readonly value: TabFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Agents', value: 'agents' },
  { label: 'Teams', value: 'teams' },
  { label: 'Tools', value: 'tools' },
];

export function NewSessionDialog({ open, onOpenChange }: Props) {
  const { namespace } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ['agents', namespace],
    queryFn: () => agentsService.list(namespace),
    enabled: Boolean(namespace),
  });

  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ['teams', namespace],
    queryFn: () => teamsService.getAll(namespace),
    enabled: Boolean(namespace),
  });

  const { data: tools = [], isLoading: loadingTools } = useQuery({
    queryKey: ['tools', namespace],
    queryFn: () => toolsService.getAll(namespace),
    enabled: Boolean(namespace),
  });

  const isLoading = loadingAgents || loadingTeams || loadingTools;

  const allParticipants = useMemo<UnifiedParticipant[]>(() => {
    const agentsList: UnifiedParticipant[] = agents.map(a => ({
      name: a.name,
      type: 'agent' as const,
      description: a.description,
    }));

    const teamsList: UnifiedParticipant[] = teams.map(t => ({
      name: t.name,
      type: 'team' as const,
      description: t.description,
    }));

    const toolsList: UnifiedParticipant[] = tools.map(t => ({
      name: t.name,
      type: 'tool' as const,
      description: t.description,
    }));

    return [...agentsList, ...teamsList, ...toolsList];
  }, [agents, teams, tools]);

  const filteredParticipants = useMemo(() => {
    let filtered = allParticipants;

    if (search) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (activeTab !== 'all') {
      filtered = filtered.filter(p => {
        if (activeTab === 'agents') return p.type === 'agent';
        if (activeTab === 'teams') return p.type === 'team';
        if (activeTab === 'tools') return p.type === 'tool';
        return true;
      });
    }

    return filtered;
  }, [allParticipants, search, activeTab]);

  const groupedParticipants = useMemo(() => {
    const agentsGroup = filteredParticipants.filter(p => p.type === 'agent');
    const teamsGroup = filteredParticipants.filter(p => p.type === 'team');
    const toolsGroup = filteredParticipants.filter(p => p.type === 'tool');

    return { agentsGroup, teamsGroup, toolsGroup };
  }, [filteredParticipants]);

  const handleSelect = (name: string) => {
    setSelectedParticipant((prev) => (prev === name ? null : name));
  };

  const handleCreate = () => {
    if (!selectedParticipant) return;

    const participant = allParticipants.find(p => p.name === selectedParticipant);
    const participantType = participant?.type || 'agent';

    const sessionId = generateUUID();
    const conversationId = generateUUID();

    push(
      `/sessions/${sessionId}?participant=${encodeURIComponent(selectedParticipant)}&type=${participantType}&conversationId=${conversationId}`
    );
    onOpenChange(false);
    setSelectedParticipant(null);
    setSearch('');
    setActiveTab('all');
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedParticipant(null);
    setSearch('');
    setActiveTab('all');
  };

  const renderParticipantItem = (participant: UnifiedParticipant) => {
    const isSelected = selectedParticipant === participant.name;
    const label = stripNamespace(participant.name);

    return (
      <button
        key={participant.name}
        type="button"
        role="option"
        data-testid="session-participant-option"
        aria-selected={isSelected}
        onClick={() => handleSelect(participant.name)}
        className={cn(
          'flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-left transition-colors hover:bg-stateslayer-overlay-hover',
          isSelected && 'bg-stateslayer-overlay-hover'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-sm text-fg-primary tracking-[-0.112px]">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        {isSelected && (
          <IconShell size="sm" variant="secondary">
            <Check />
          </IconShell>
        )}
      </button>
    );
  };

  const renderSection = (title: string, items: UnifiedParticipant[]) => {
    if (items.length === 0) return null;

    return (
      <div className="flex w-full flex-col gap-3" role="group" aria-label={title}>
        <div className="text-fg-primary flex items-center gap-1 text-sm tracking-[-0.112px]">
          <span>{title}</span>
          <span>({items.length})</span>
        </div>
        <div className="bg-fill-onsurface-ui-2 shadow-elevation-1 flex w-full flex-col py-1">
          {items.map(renderParticipantItem)}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="text-fg-tertiary flex flex-1 items-center justify-center py-8 text-center text-sm">
          Loading targets...
        </div>
      );
    }

    if (filteredParticipants.length === 0) {
      return (
        <div className="text-fg-tertiary flex flex-1 items-center justify-center py-8 text-center text-sm">
          No targets found
        </div>
      );
    }

    return (
      <ScrollArea className="min-h-0 flex-1 pr-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div role="listbox" aria-label="Targets" className="flex flex-col gap-6">
          {renderSection('Agents', groupedParticipants.agentsGroup)}
          {renderSection('Teams', groupedParticipants.teamsGroup)}
          {renderSection('Tools', groupedParticipants.toolsGroup)}
        </div>
      </ScrollArea>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-surface-bg-secondary sm:max-w-[600px] flex h-[700px] max-h-[90vh] flex-col gap-10 border-0 p-12"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex w-full flex-col gap-1">
              <DialogTitle className="text-xl font-normal leading-7">
                Create new session
              </DialogTitle>
              <DialogDescription className="text-fg-tertiary text-base leading-6 tracking-[-0.032px]">
                Select one target to start a session
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Close"
              className="text-fg-primary opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stroke-status-focus"
            >
              <IconShell size="default" variant="secondary">
                <Close />
              </IconShell>
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="border-b-stroke-tertiary flex h-8 w-full items-center gap-2 border-b">
              <IconShell size="sm" variant="secondary">
                <Search />
              </IconShell>
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search"
                autoFocus
                className="text-fg-primary placeholder:text-fg-disabled w-full bg-transparent text-sm tracking-[-0.112px] outline-none"
              />
            </div>

            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <TagToggle
                  key={f.value}
                  size="sm"
                  pressed={activeTab === f.value}
                  onPressedChange={(pressed) => {
                    if (pressed) setActiveTab(f.value);
                  }}
                >
                  {f.label}
                </TagToggle>
              ))}
            </div>
          </div>

          {renderContent()}
        </div>

        <div className="flex flex-col gap-6">
          <Separator className="bg-stroke-divider" />
          <div className="flex items-center justify-end">
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="min-w-[92px]">
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!selectedParticipant}
                className="min-w-[92px]"
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
