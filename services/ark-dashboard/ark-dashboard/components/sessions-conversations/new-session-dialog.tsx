'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { agentsService } from '@/lib/services/agents';
import { teamsService } from '@/lib/services/teams';
import { toolsService } from '@/lib/services/tools';
import { generateUUID } from '@/lib/utils/uuid';
import type { ParticipantType } from '@/lib/services/conversations';

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

export function NewSessionDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsService.getAll(),
  });

  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.getAll(),
  });

  const { data: tools = [], isLoading: loadingTools } = useQuery({
    queryKey: ['tools'],
    queryFn: () => toolsService.getAll(),
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
    setSelectedParticipant(name);
  };

  const handleCreate = () => {
    if (!selectedParticipant) return;

    const participant = allParticipants.find(p => p.name === selectedParticipant);
    const participantType = participant?.type || 'agent';

    const sessionId = generateUUID();
    const conversationId = generateUUID();

    router.push(
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

    return (
      <label
        key={participant.name}
        className="flex cursor-pointer items-center gap-3 rounded px-2 py-1"
      >
        <input
          type="radio"
          name="participant"
          value={participant.name}
          checked={isSelected}
          onChange={() => handleSelect(participant.name)}
          className="size-4 border-2 border-muted-foreground"
        />
        <span className="text-sm">{participant.name}</span>
      </label>
    );
  };

  const renderTabContent = () => {
    if (isLoading) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          Loading participants...
        </div>
      );
    }

    if (filteredParticipants.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          No participants found
        </div>
      );
    }

    return (
      <div className="max-h-[400px] space-y-4 overflow-y-auto">
        {groupedParticipants.agentsGroup.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              Agents ({groupedParticipants.agentsGroup.length})
            </h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3">
              {groupedParticipants.agentsGroup.map(renderParticipantItem)}
            </div>
          </div>
        )}

        {groupedParticipants.teamsGroup.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              Teams ({groupedParticipants.teamsGroup.length})
            </h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3">
              {groupedParticipants.teamsGroup.map(renderParticipantItem)}
            </div>
          </div>
        )}

        {groupedParticipants.toolsGroup.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              Tools ({groupedParticipants.toolsGroup.length})
            </h3>
            <div className="space-y-1 rounded-lg bg-white/5 p-3">
              {groupedParticipants.toolsGroup.map(renderParticipantItem)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <DialogTitle>Create new session</DialogTitle>
              <DialogDescription>
                Select one participant to start a session
              </DialogDescription>
            </div>
            <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative border-b border-border pb-2">
            <Search className="absolute left-2 top-[12px] size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 !h-9 !border-0 !bg-transparent !shadow-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
              autoFocus
            />
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {renderTabContent()}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedParticipant ? '1 participant selected' : '0 participants selected'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="!border-white/30 !bg-black/10">
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!selectedParticipant}
                className="disabled:!bg-white/5 disabled:!text-white/40 disabled:!opacity-100"
              >
                Create
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
