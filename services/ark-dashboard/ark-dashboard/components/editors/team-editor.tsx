'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
import type {
  Agent,
  Team,
  TeamCreateRequest,
  TeamMember,
  TeamUpdateRequest,
} from '@/lib/services';
import { cn } from '@/lib/utils';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

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

const formSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  strategy: z.string().min(1, 'Strategy is required'),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
});

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
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [orderedAgents, setOrderedAgents] = useState<Agent[]>([]);
  const [graphEdgesError, setGraphEdgesError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [unavailableMembers, setUnavailableMembers] = useState<TeamMember[]>(
    [],
  );
  const [availableMembers, setAvailableMembers] = useState<TeamMember[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      strategy: 'round-robin',
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: '',
    },
  });

  const selectedStrategy = form.watch('strategy');
  const selectorAgentValue = form.watch('selectorAgent');

  // Clear errors when strategy changes
  useEffect(() => {
    form.clearErrors();
    setGraphEdgesError(null);
    setMembersError(null);
  }, [selectedStrategy, form]);

  // Check for unavailable members when team changes
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

  // Reset form when dialog opens/closes or team changes
  useEffect(() => {
    if (!open) {
      // Reset everything when dialog closes
      if (!team) {
        form.reset();
        setSelectedMembers([]);
        setGraphEdges([]);
        setOrderedAgents(agents);
        setUnavailableMembers([]);
        setAvailableMembers([]);
      }
      setGraphEdgesError(null);
      setMembersError(null);
      return;
    }

    if (team) {
      form.reset({
        name: team.name,
        description: team.description ?? '',
        strategy: team.strategy || 'round-robin',
        maxTurns: team.maxTurns ? String(team.maxTurns) : '',
        selectorAgent: team.selector?.agent ?? '',
        selectorPrompt: team.selector?.selectorPrompt ?? '',
      });
      setGraphEdges(team.graph?.edges || []);
    } else {
      form.reset();
      setSelectedMembers([]);
      setGraphEdges([]);
      setOrderedAgents(agents);
    }
    setGraphEdgesError(null);
    setMembersError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, open]);

  // Sync selected members with available members when they change
  useEffect(() => {
    if (team && open) {
      setSelectedMembers(availableMembers);
    }
  }, [team, open, availableMembers]);

  // Update ordered agents when selection changes
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

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Clear previous errors
    setMembersError(null);
    setGraphEdgesError(null);

    // Validate members
    if (selectedMembers.length === 0) {
      setMembersError('At least one team member is required');
      return;
    }

    // Validate no unavailable members in selector agent
    if (
      selectedStrategy === 'selector' &&
      unavailableMembers.some(m => m.name === values.selectorAgent)
    ) {
      form.setError('selectorAgent', {
        message: 'Selected agent is no longer available',
      });
      return;
    }

    // Validate graph edges for both graph and selector strategies
    if (
      (selectedStrategy === 'graph' || selectedStrategy === 'selector') &&
      graphEdges.length > 0
    ) {
      // Check for unavailable members in edges
      const hasUnavailableInEdges = graphEdges.some(
        edge =>
          unavailableMembers.some(m => m.name === edge.from) ||
          unavailableMembers.some(m => m.name === edge.to),
      );
      if (hasUnavailableInEdges) {
        setGraphEdgesError(
          'Some edges reference members that are no longer available',
        );
        return;
      }

      // Both from and to are required per API validation
      if (!graphEdges.every(edge => edge.from && edge.to)) {
        setGraphEdgesError(
          'All edges must have both "From" and "To" set to valid members',
        );
        return;
      }
    }

    // Validate graph strategy specific requirements
    if (selectedStrategy === 'graph') {
      if (!values.maxTurns) {
        form.setError('maxTurns', {
          message: 'Max turns is required for graph strategy',
        });
        return;
      }
      if (graphEdges.length === 0) {
        setGraphEdgesError('At least one edge is required for graph strategy');
        return;
      }
      // Graph strategy doesn't allow multiple outgoing edges from same member
      const fromCounts = new Map<string, number>();
      for (const edge of graphEdges) {
        if (edge.from) {
          fromCounts.set(edge.from, (fromCounts.get(edge.from) || 0) + 1);
        }
      }
      const duplicateFrom = Array.from(fromCounts.entries()).find(
        ([, count]) => count > 1,
      );
      if (duplicateFrom) {
        setGraphEdgesError(
          `Member "${duplicateFrom[0]}" has more than one outgoing edge`,
        );
        return;
      }
    }

    // Validate selector strategy requirements
    if (
      selectedStrategy === 'selector' &&
      (!values.selectorAgent || values.selectorAgent === '__none__')
    ) {
      form.setError('selectorAgent', {
        message: 'Selector agent is required for selector strategy',
      });
      return;
    }

    const baseData = {
      description: values.description || undefined,
      members: selectedMembers.length > 0 ? selectedMembers : undefined,
      strategy: values.strategy || undefined,
      maxTurns: values.maxTurns ? parseInt(values.maxTurns) : undefined,
      selector:
        values.selectorAgent || values.selectorPrompt
          ? {
              agent: values.selectorAgent || undefined,
              selectorPrompt: values.selectorPrompt || undefined,
            }
          : undefined,
      graph: graphEdges.length > 0 ? { edges: graphEdges } : undefined,
    };

    if (team) {
      const updateData: TeamUpdateRequest & { id: string } = {
        ...baseData,
        id: team.id,
      };
      onSave(updateData);
    } else {
      const createData: TeamCreateRequest = {
        ...baseData,
        name: values.name,
        members: selectedMembers,
        strategy: values.strategy ?? '',
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
    if (selectedStrategy === 'selector' && selectorAgentValue === member.name) {
      form.setValue('selectorAgent', '');
    }
    if (
      (selectedStrategy === 'graph' || selectedStrategy === 'selector') &&
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

  const moveCard = (dragIndex: number, hoverIndex: number) => {
    const updated = [...orderedAgents];
    const [removed] = updated.splice(dragIndex, 1);
    updated.splice(hoverIndex, 0, removed);
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., engineering-team"
                        disabled={!!team || form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Core development and infrastructure team"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Strategy <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a strategy" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="round-robin">Round Robin</SelectItem>
                        <SelectItem value="selector">Selector</SelectItem>
                        <SelectItem value="graph">Graph</SelectItem>
                        <SelectItem value="sequential">Sequential</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxTurns"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Max Turns{' '}
                      {selectedStrategy === 'graph' && (
                        <span className="text-red-500">*</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 10"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <TeamMemberSelectionSection
                unavailableMembers={unavailableMembers}
                onDeleteMember={onDeleteClick}
              />

              <div className="grid gap-2">
                <Label>
                  Members <span className="text-red-500">*</span>
                </Label>
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
                {membersError && (
                  <p className="text-sm text-red-500">{membersError}</p>
                )}
              </div>

              {selectedStrategy === 'selector' && (
                <>
                  <div className="bg-muted/50 rounded-md border p-3">
                    <p className="text-muted-foreground mb-3 text-xs">
                      Selector strategy uses an AI agent to choose the next team
                      member. You can optionally add graph constraints below to
                      limit selection to valid transitions.
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="selectorAgent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Selector Agent <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger
                              className={cn(
                                '',
                                unavailableMembers.some(
                                  m => m.name === field.value,
                                ) && 'border-red-500',
                              )}>
                              <SelectValue placeholder="Select an agent" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None (Unset)
                              </span>
                            </SelectItem>
                            {field.value &&
                              unavailableMembers.some(
                                m => m.name === field.value,
                              ) && (
                                <SelectItem
                                  key={field.value}
                                  value={field.value}>
                                  {field.value} (Unavailable)
                                </SelectItem>
                              )}
                            {agents.map(agent => (
                              <SelectItem key={agent.name} value={agent.name}>
                                {agent.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="selectorPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selector Prompt</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter the selector prompt..."
                            className="min-h-[100px]"
                            disabled={form.formState.isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {(selectedStrategy === 'graph' ||
                selectedStrategy === 'selector') && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      Graph Edges{' '}
                      {selectedStrategy === 'graph' && (
                        <span className="text-red-500">*</span>
                      )}
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addGraphEdge}
                      disabled={form.formState.isSubmitting}>
                      Add Edge
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {graphEdges.length === 0 ? (
                      <p className="text-muted-foreground py-4 text-center text-sm">
                        No edges defined. Click &quot;Add Edge&quot; to create
                        graph connections.
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
                              }
                              disabled={form.formState.isSubmitting}>
                              <SelectTrigger
                                className={cn(
                                  'flex-1',
                                  isFromUnavailable && 'border-red-500',
                                )}>
                                <SelectValue placeholder="From" />
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
                              }
                              disabled={form.formState.isSubmitting}>
                              <SelectTrigger
                                className={cn(
                                  'flex-1',
                                  isToUnavailable && 'border-red-500',
                                )}>
                                <SelectValue placeholder="To" />
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
                              onClick={() => removeGraphEdge(index)}
                              disabled={form.formState.isSubmitting}>
                              Remove
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {selectedStrategy === 'graph' ? (
                      <>
                        Define the flow between agents. Both &quot;From&quot;
                        and &quot;To&quot; must be valid team members.
                      </>
                    ) : (
                      <>
                        Define graph constraints to limit AI selection to valid
                        transitions. Both &quot;From&quot; and &quot;To&quot;
                        must be valid team members.
                      </>
                    )}
                  </p>
                  {graphEdgesError && (
                    <p className="text-sm text-red-500">{graphEdgesError}</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? 'Saving...'
                  : team
                    ? 'Update'
                    : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
