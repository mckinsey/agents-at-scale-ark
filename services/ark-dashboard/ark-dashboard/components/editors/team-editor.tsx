'use client';

import { AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { components } from '@/lib/api/generated/types';
import {
  type Agent,
  type Team,
  type TeamCreateRequest,
  type TeamMember,
  type TeamUpdateRequest,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { getKubernetesNameError } from '@/lib/utils/kubernetes-validation';

import { TeamMemberSelectionSection } from './member-editor';

type GraphEdge = components['schemas']['GraphEdge'];

interface TeamEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: Team | null;
  agents: Agent[];
  onSave: (
    team: (TeamCreateRequest | TeamUpdateRequest) & { id?: string },
  ) => void;
}

const ItemTypes = { CARD: 'card' };

function DraggableCard({
  index,
  moveCard,
  isSelected,
  toggleMember,
  agent,
  agentIsExternal: _agentIsExternal,
}: Readonly<{
  index: number;
  moveCard: (dragIndex: number, hoverIndex: number) => void;
  isSelected: boolean;
  toggleMember: (agent: Agent) => void;
  agent: Agent;
  agentIsExternal: boolean;
}>) {
  const ref = useRef<HTMLDivElement>(null);

  const [, drop] = useDrop({
    accept: ItemTypes.CARD,
    hover(item: { id: string; index: number }) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      // Move card when hovering
      moveCard(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging: _isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: { index },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div ref={ref} className="flex w-fit cursor-move items-center space-x-2">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => toggleMember(agent)}
      />
      <Label
        htmlFor={`agent-${agent.id}`}
        className="flex-10 cursor-pointer text-sm font-normal">
        <div className="font-medium">{agent.name}</div>
        {agent.description && (
          <div className="text-muted-foreground text-xs">
            {agent.description}
          </div>
        )}
      </Label>
    </div>
  );
}

export function TeamEditor({
  open,
  onOpenChange,
  team,
  agents,
  onSave,
}: Readonly<TeamEditorProps>) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [strategy, setStrategy] = useState<string>('round-robin');
  const [maxTurns, setMaxTurns] = useState<string>('');
  const [selectorAgent, setSelectorAgent] = useState<string>('');
  const [selectorPrompt, setSelectorPrompt] = useState<string>('');
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [orderedAgents, setOrderedAgents] = useState<Agent[]>([]);
  const [unavailableMembers, setUnavailableMembers] = useState<TeamMember[]>(
    [],
  );
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (team && team.members) {
      const missingMembers = team.members.filter(
        teamMember => !agents.some(a => a.name === teamMember.name),
      ) as TeamMember[];
      const checkMissingAgents = async () => {
        try {
          if (missingMembers.length > 0) {
            setAvailableMembers(
              team.members.filter(m => !missingMembers.includes(m)),
            );
          } else {
            setAvailableMembers(team.members);
          }
          setUnavailableMembers(missingMembers || []);
        } catch (error) {
          console.error('Failed to load all agents:', error);
          setUnavailableMembers([]);
        }
      };
      if (open) {
        checkMissingAgents();
      } else {
        setAvailableMembers(
          team.members.filter(m => !missingMembers.includes(m)),
        );
      }
    }
  }, [open, team, team?.members, agents]);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description ?? '');
      setSelectedMembers(availableMembers);
      setStrategy(team.strategy || 'round-robin');
      setMaxTurns(team.maxTurns ? String(team.maxTurns) : '');
      setSelectorPrompt(team.selector?.selectorPrompt ?? '');
      if (!open) {
        // only if the TeamEditor is not open to avoid
        // overwritten while you are updating values on editor
        setSelectorAgent(team.selector?.agent ?? '');
        setGraphEdges(team.graph?.edges || []);
      }
    } else {
      setName('');
      setDescription('');
      setSelectedMembers([]);
      setStrategy('round-robin');
      setMaxTurns('');
      setSelectorAgent('');
      setSelectorPrompt('');
      setGraphEdges([]);
      setOrderedAgents(agents);
    }
  }, [open, team, availableMembers, team?.members, agents]);

  useEffect(() => {
    if (agents && selectedMembers) {
      const agentsNotSelected = agents.filter(
        a => !selectedMembers?.some(m => m.name === a.name),
      );

      const agentsSelected = selectedMembers
        .map(m => agents.find(a => a.name === m.name))
        .filter((a): a is Agent => !!a);
      setOrderedAgents([...agentsSelected, ...agentsNotSelected]);
    }
  }, [selectedMembers, agents, open]);

  const handleSave = () => {
    const baseData = {
      description: description || undefined,
      members: selectedMembers.length > 0 ? selectedMembers : undefined,
      strategy: strategy || undefined,
      maxTurns: maxTurns ? parseInt(maxTurns) : undefined,
      selector:
        selectorAgent || selectorPrompt
          ? {
              agent: selectorAgent || undefined,
              selectorPrompt: selectorPrompt || undefined,
            }
          : undefined,
      graph: graphEdges.length > 0 ? { edges: graphEdges } : undefined,
    };

    if (team) {
      // Update existing team (exclude name, add id)
      const updateData: TeamUpdateRequest & { id: string } = {
        ...baseData,
        id: team.id,
      };
      onSave(updateData);
    } else {
      // Create new team (include name)
      const createData: TeamCreateRequest = {
        ...baseData,
        name,
        members: selectedMembers,
        strategy: strategy ?? '',
      };
      onSave(createData);
    }

    onOpenChange(false);
  };

  const isExternalAgent = useCallback((agent: Agent): boolean => {
    return agent.executionEngine?.name === 'a2a';
  }, []);

  const toggleMember = (agent: Agent) => {
    const member: TeamMember = {
      name: agent.name,
      type: 'agent',
    };

    setSelectedMembers(prev => {
      const exists = prev.some(
        m => m.name === agent.name && m.type === 'agent',
      );
      if (exists) {
        return prev.filter(m => !(m.name === agent.name && m.type === 'agent'));
      } else {
        return [...prev, member];
      }
    });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value) {
      const error = getKubernetesNameError(value);
      setNameError(error);
    } else {
      setNameError(null);
    }
  };

  const addGraphEdge = () => {
    setGraphEdges(prev => [...prev, { to: '', from: '' }]);
  };

  const updateGraphEdge = (
    index: number,
    field: 'from' | 'to',
    value: string,
  ) => {
    setGraphEdges(prev => {
      const newEdges = [...prev];
      newEdges[index] = { ...newEdges[index], [field]: value };
      return newEdges;
    });
  };

  const removeGraphEdge = (index: number) => {
    setGraphEdges(prev => prev.filter((_, i) => i !== index));
  };

  const onDeleteClick = (member: TeamMember) => {
    setUnavailableMembers(prev =>
      prev.filter(unavailableMember => unavailableMember.name !== member.name),
    );
    setAvailableMembers(prev => prev.filter(m => m.name !== member.name));
    setSelectedMembers(prev => prev.filter(m => m.name !== member.name));
    if (strategy === 'selector' && selectorAgent === member.name) {
      setSelectorAgent('');
    }
    if (
      (strategy === 'graph' || strategy === 'selector') &&
      graphEdges.length > 0
    ) {
      setGraphEdges(prev =>
        prev.map(e => {
          let newEdge: GraphEdge;
          if (e.from === member.name) {
            newEdge = {
              from: '',
              to: e.to,
            };
          } else if (e.to === member.name) {
            newEdge = {
              from: e.from,
              to: '',
            };
          } else {
            newEdge = e;
          }
          return newEdge;
        }),
      );
    }
  };

  const isGraphValid =
    strategy !== 'graph' ||
    (graphEdges.length > 0 &&
      graphEdges.every(
        edge =>
          edge.to &&
          !unavailableMembers.some(
            m => m.name === edge.from || m.name === edge.to,
          ),
      ) &&
      maxTurns.trim() !== '');
  // Graph edges are optional for selector strategy, but if provided must be valid
  const isGraphEdgesValid =
    strategy !== 'selector' ||
    graphEdges.length === 0 ||
    graphEdges.every(edge => edge.to);
  const isSelectorValid =
    strategy !== 'selector' ||
    (selectorAgent &&
      selectorAgent !== '__none__' &&
      !unavailableMembers.some(m => m.name === selectorAgent));
  const isValid =
    name.trim() &&
    selectedMembers.length > 0 &&
    isGraphValid &&
    isGraphEdgesValid &&
    isSelectorValid &&
    !nameError;

  const moveCard = (dragIndex: number, hoverIndex: number) => {
    const updated = [...orderedAgents];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(hoverIndex, 0, removed);
    // Update selectedMembers to match new order
    const updatedSelectedMembers: TeamMember[] = updated
      .filter(agent =>
        selectedMembers.some(m => m.name === agent.name && m.type === 'agent'),
      )
      .map(agent => ({
        name: agent.name,
        type: selectedMembers.find(m => m.name === agent.name)?.type || 'agent',
      }));
    setSelectedMembers(updatedSelectedMembers);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{team ? 'Edit Team' : 'Create New Team'}</DialogTitle>
          <DialogDescription>
            {team
              ? 'Update the team information below.'
              : 'Fill in the information for the new team.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g., engineering-team"
              disabled={!!team}
              className={nameError ? 'border-red-500' : ''}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-500">{nameError}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., Core development and infrastructure team"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="strategy">Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger id="strategy">
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round-robin">Round Robin</SelectItem>
                <SelectItem value="selector">Selector</SelectItem>
                <SelectItem value="graph">Graph</SelectItem>
                <SelectItem value="sequential">Sequential</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxTurns">Max Turns</Label>
            <Input
              id="maxTurns"
              type="number"
              value={maxTurns}
              onChange={e => setMaxTurns(e.target.value)}
              placeholder="e.g., 10"
            />
            {strategy === 'graph' && !maxTurns && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Graph strategy requires Max Turns to be set
                </AlertDescription>
              </Alert>
            )}
          </div>
          <TeamMemberSelectionSection
            unavailableMembers={unavailableMembers}
            onDeleteMember={onDeleteClick}
          />
          <div className="grid gap-2">
            <Label>Members</Label>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
              {agents.length === 0 ? (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  No agents available
                </p>
              ) : (
                <DndProvider backend={HTML5Backend}>
                  {orderedAgents.map((agent, index) => {
                    const isSelected = selectedMembers.some(
                      m => m.name === agent.name && m.type === 'agent',
                    );
                    const agentIsExternal = isExternalAgent(agent);

                    return (
                      <DraggableCard
                        key={agent.name + `${index}`}
                        index={index}
                        moveCard={moveCard}
                        isSelected={isSelected}
                        toggleMember={toggleMember}
                        agent={agent}
                        agentIsExternal={agentIsExternal}
                      />
                    );
                  })}
                </DndProvider>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {selectedMembers.length} member
              {selectedMembers.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          {strategy === 'selector' && (
            <>
              <div className="bg-muted/50 rounded-md border p-3">
                <p className="text-muted-foreground mb-3 text-xs">
                  Selector strategy uses an AI agent to choose the next team
                  member. You can optionally add graph constraints below to
                  limit selection to valid transitions.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="selector-agent">Selector Agent</Label>
                <Select value={selectorAgent} onValueChange={setSelectorAgent}>
                  <SelectTrigger
                    id="selector-agent"
                    className={cn(
                      '',
                      unavailableMembers.some(m => m.name === selectorAgent) &&
                        'border-red-500',
                    )}>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">
                        None (Unset)
                      </span>
                    </SelectItem>
                    {unavailableMembers.some(m => m.name === selectorAgent) && (
                      <SelectItem key={selectorAgent} value={selectorAgent}>
                        {selectorAgent}
                      </SelectItem>
                    )}
                    {agents.map(agent => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="selector-prompt">Selector Prompt</Label>
                <Textarea
                  id="selector-prompt"
                  value={selectorPrompt}
                  onChange={e => setSelectorPrompt(e.target.value)}
                  placeholder="Enter the selector prompt..."
                  className="min-h-[100px]"
                />
              </div>
            </>
          )}
          {(strategy === 'graph' || strategy === 'selector') && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Graph Edges</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addGraphEdge}>
                  Add Edge
                </Button>
              </div>
              <div className="space-y-2">
                {graphEdges.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No edges defined. Click &quot;Add Edge&quot; to create graph
                    connections.
                  </p>
                ) : (
                  graphEdges.map((edge, index) => {
                    const isFromUnavailable = unavailableMembers.some(
                      member => member.name === edge.from,
                    );
                    const isToUnavailable = unavailableMembers.some(
                      member => member.name === edge.to,
                    );
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <Select
                          value={edge.from || ''}
                          onValueChange={value =>
                            updateGraphEdge(index, 'from', value)
                          }>
                          <SelectTrigger
                            className={cn(
                              'flex-1',
                              isFromUnavailable && 'border-red-500',
                            )}>
                            <SelectValue placeholder="From (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {isFromUnavailable && (
                              <SelectItem key={edge.from} value={edge.from}>
                                {edge.from} (Unavailable)
                              </SelectItem>
                            )}
                            {selectedMembers
                              .filter(m => m.type === 'agent')
                              .map(member => (
                                <SelectItem
                                  key={member.name}
                                  value={member.name}>
                                  {member.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">→</span>
                        <Select
                          value={edge.to}
                          onValueChange={value =>
                            updateGraphEdge(index, 'to', value)
                          }>
                          <SelectTrigger
                            className={cn(
                              'flex-1',
                              isToUnavailable && 'border-red-500',
                            )}>
                            <SelectValue placeholder="To (required)" />
                          </SelectTrigger>
                          <SelectContent>
                            {isToUnavailable && (
                              <SelectItem key={edge.to} value={edge.to}>
                                {edge.to} (Unavailable)
                              </SelectItem>
                            )}
                            {selectedMembers
                              .filter(m => m.type === 'agent')
                              .map(member => (
                                <SelectItem
                                  key={member.name}
                                  value={member.name}>
                                  {member.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeGraphEdge(index)}>
                          Remove
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {strategy === 'graph' ? (
                  <>
                    Define the flow between agents. &quot;From&quot; is optional
                    and defaults to any agent.
                  </>
                ) : (
                  <>
                    Optional: Define graph constraints to limit AI selection to
                    valid transitions. When provided, the selector agent will
                    only choose from members that are legal according to the
                    graph edges.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {team ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
