'use client';

import { useState, useMemo } from 'react';
import { Search, Bot, Users, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { agentsService } from '@/lib/services/agents';
import { teamsService } from '@/lib/services/teams';
import { toolsService } from '@/lib/services/tools';
import { generateUUID } from '@/lib/utils/uuid';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ParticipantType = 'agent' | 'team' | 'tool';

interface UnifiedParticipant {
  name: string;
  type: ParticipantType;
  description?: string | null;
}

type TabFilter = 'all' | 'agents' | 'teams' | 'tools';

function getParticipantIcon(type: ParticipantType) {
  if (type === 'agent') return <Bot className="size-4" />;
  if (type === 'team') return <Users className="size-4" />;
  if (type === 'tool') return <Wrench className="size-4" />;
  return <Bot className="size-4" />;
}

export function NewSessionDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
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

  const handleToggle = (name: string) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleCreate = () => {
    const sessionId = generateUUID();
    const conversationId = generateUUID();
    const participants = Array.from(selectedParticipants).map(name => {
      const participant = allParticipants.find(p => p.name === name);
      return {
        name,
        type: participant?.type || 'agent',
      };
    });

    localStorage.setItem(`temp-session-${sessionId}`, JSON.stringify({
      sessionId,
      conversationId,
      participants,
      createdAt: new Date().toISOString(),
    }));

    router.push(`/sessions/${sessionId}`);
    onOpenChange(false);
    setSelectedParticipants(new Set());
    setSearch('');
    setActiveTab('all');
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedParticipants(new Set());
    setSearch('');
    setActiveTab('all');
  };

  const renderParticipantItem = (participant: UnifiedParticipant) => (
    <label
      key={participant.name}
      className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-accent"
    >
      <Checkbox
        checked={selectedParticipants.has(participant.name)}
        onCheckedChange={() => handleToggle(participant.name)}
      />
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
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create new session</DialogTitle>
          <DialogDescription>
            Select one or more participants to start a session
          </DialogDescription>
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

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  Loading participants...
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No participants found
                </div>
              ) : (
                <div className="max-h-[400px] space-y-4 overflow-y-auto">
                  {groupedParticipants.agentsGroup.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Agents ({groupedParticipants.agentsGroup.length})
                      </h3>
                      <div className="space-y-1">
                        {groupedParticipants.agentsGroup.map(renderParticipantItem)}
                      </div>
                    </div>
                  )}

                  {groupedParticipants.teamsGroup.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Teams ({groupedParticipants.teamsGroup.length})
                      </h3>
                      <div className="space-y-1">
                        {groupedParticipants.teamsGroup.map(renderParticipantItem)}
                      </div>
                    </div>
                  )}

                  {groupedParticipants.toolsGroup.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        Tools ({groupedParticipants.toolsGroup.length})
                      </h3>
                      <div className="space-y-1">
                        {groupedParticipants.toolsGroup.map(renderParticipantItem)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex w-full items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedParticipants.size} participant{selectedParticipants.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={selectedParticipants.size === 0}
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
