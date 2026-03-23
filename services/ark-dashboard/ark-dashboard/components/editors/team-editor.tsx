'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronRight,
  CircleAlert,
  GripVertical,
  Maximize2,
  Minimize2,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DEFAULT_SELECTOR_PROMPT } from '@/components/forms/team-form/use-team-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

export { DEFAULT_SELECTOR_PROMPT };

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
  loops: z.boolean(),
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
    <div
      ref={ref}
      className="hover:bg-muted/50 flex items-start space-x-2 rounded-md p-2">
      <GripVertical className="text-muted-foreground mt-1 h-4 w-4 cursor-move" />
      <Checkbox
        id={`agent-${agent.id}`}
        checked={isSelected}
        onCheckedChange={() => toggleMember(agent)}
        className="mt-1"
      />
      <Label
        htmlFor={`agent-${agent.id}`}
        className="flex-1 cursor-pointer text-sm font-normal">
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
  const [isSelectorPromptExpanded, setIsSelectorPromptExpanded] =
    useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      strategy: 'sequential',
      loops: false,
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
        strategy: team.strategy || 'sequential',
        loops: team.loops ?? false,
        maxTurns: team.maxTurns ? String(team.maxTurns) : '',
        selectorAgent: team.selector?.agent ?? '',
        selectorPrompt:
          team.selector?.selectorPrompt ||
          (team.strategy === 'selector' ? DEFAULT_SELECTOR_PROMPT : ''),
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
      loops: values.loops,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
                      onValueChange={value => {
                        field.onChange(value);
                        if (
                          value === 'selector' &&
                          !form.getValues('selectorPrompt')
                        ) {
                          form.setValue(
                            'selectorPrompt',
                            DEFAULT_SELECTOR_PROMPT,
                          );
                        }
                      }}
                      value={field.value}
                      disabled={form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a strategy" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sequential">Sequential</SelectItem>
                        <SelectItem value="selector">Selector</SelectItem>
                        <SelectItem value="graph">Graph</SelectItem>
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

              <div className="grid gap-2">
                <Label>
                  Members <span className="text-red-500">*</span>
                </Label>
                <div className="space-y-2">
                  {agents.length === 0 ? (
                    <div className="text-muted-foreground text-sm">
                      No agents available in this namespace
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Filter members..."
                        value={memberSearchQuery}
                        onChange={e => setMemberSearchQuery(e.target.value)}
                        className="text-sm"
                      />
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                        <DndProvider backend={HTML5Backend}>
                          {unavailableMembers.length > 0 && (
                            <UnavailableMembersSection
                              unavailableMembers={unavailableMembers}
                              onDeleteMember={onDeleteClick}
                            />
                          )}
                          {orderedAgents
                            .filter(
                              agent =>
                                agent.name
                                  .toLowerCase()
                                  .includes(memberSearchQuery.toLowerCase()) ||
                                agent.description
                                  ?.toLowerCase()
                                  .includes(memberSearchQuery.toLowerCase()),
                            )
                            .map((agent, index) => {
                              const isSelected = selectedMembers.some(
                                m =>
                                  m.name === agent.name && m.type === 'agent',
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
                          {orderedAgents.filter(
                            agent =>
                              agent.name
                                .toLowerCase()
                                .includes(memberSearchQuery.toLowerCase()) ||
                              agent.description
                                ?.toLowerCase()
                                .includes(memberSearchQuery.toLowerCase()),
                          ).length === 0 &&
                            memberSearchQuery && (
                              <div className="text-muted-foreground py-2 text-center text-sm">
                                No members found matching &quot;
                                {memberSearchQuery}&quot;
                              </div>
                            )}
                        </DndProvider>
                      </div>
                    </>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {selectedMembers.length} member
                    {selectedMembers.length !== 1 ? 's' : ''} selected
                  </p>
                  {membersError && (
                    <p className="text-sm text-red-500">{membersError}</p>
                  )}
                </div>
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
                        <div className="flex items-center justify-between">
                          <FormLabel>Selector Prompt</FormLabel>
                          <div className="flex items-center gap-2">
                            {field.value && field.value.length > 0 && (
                              <span className="text-muted-foreground text-xs">
                                {field.value.length} characters
                              </span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setIsSelectorPromptExpanded(
                                  !isSelectorPromptExpanded,
                                )
                              }
                              className="h-8 px-2">
                              {isSelectorPromptExpanded ? (
                                <>
                                  <Minimize2 className="mr-1 h-4 w-4" />
                                  Collapse
                                </>
                              ) : (
                                <>
                                  <Maximize2 className="mr-1 h-4 w-4" />
                                  Expand
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder="Enter the selector prompt..."
                            disabled={form.formState.isSubmitting}
                            className={`resize-none transition-all duration-200 ${
                              isSelectorPromptExpanded
                                ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                                : 'max-h-[150px] min-h-[100px]'
                            }`}
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                            }}
                            {...field}
                          />
                        </FormControl>
                        {isSelectorPromptExpanded &&
                          field.value &&
                          field.value.length > 0 && (
                            <div className="text-muted-foreground text-xs">
                              {field.value.split('\n').length} lines
                            </div>
                          )}
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
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                    {graphEdges.length === 0 ? (
                      <div className="text-muted-foreground py-2 text-center text-sm">
                        No edges defined. Click &quot;Add Edge&quot; to create
                        graph connections.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {graphEdges.map((edge, index) => {
                          const isFromUnavailable = unavailableMembers.some(
                            member => member.name === edge.from,
                          );
                          const isToUnavailable = unavailableMembers.some(
                            member => member.name === edge.to,
                          );
                          return (
                            <div
                              key={index}
                              className="hover:bg-muted/50 flex items-center gap-2 rounded-md p-2">
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
                                    <SelectItem
                                      key={edge.from}
                                      value={edge.from}>
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
                                size="icon"
                                className="h-8 w-8 hover:text-red-500"
                                onClick={() => removeGraphEdge(index)}
                                disabled={form.formState.isSubmitting}
                                aria-label="Remove edge">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-left" tabIndex={-1} asChild>
                    <span className="inline-block">
                      <Button
                        type="submit"
                        disabled={
                          form.formState.isSubmitting ||
                          unavailableMembers.length > 0
                        }>
                        {form.formState.isSubmitting
                          ? 'Saving...'
                          : team
                            ? 'Update'
                            : 'Create'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {unavailableMembers.length > 0
                        ? 'Delete all unavailable members to proceed'
                        : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface UnavailableMembersSectionProps {
  unavailableMembers: TeamMember[];
  onDeleteMember: (member: TeamMember) => void;
}

const MemberItem = ({
  member,
  onDelete,
}: {
  member: TeamMember;
  onDelete: (member: TeamMember) => void;
}) => (
  <div className="flex flex-row justify-between" key={`member-${member.name}`}>
    <div className="flex w-fit items-start space-x-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="text-left" tabIndex={-1}>
            <CircleAlert className="mt-1 h-4 w-4 text-red-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>This member is unavailable in the system</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Label className="flex-1 cursor-pointer text-sm font-normal">
        <div className="font-medium">{member.name}</div>
      </Label>
    </div>
    <div>
      <Button
        variant={'ghost'}
        size="sm"
        className="h-8 w-8 p-0 hover:text-red-500"
        onClick={() => onDelete(member)}
        aria-label={'Delete member'}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

function UnavailableMembersSection({
  unavailableMembers,
  onDeleteMember,
}: Readonly<UnavailableMembersSectionProps>) {
  return (
    <Collapsible
      defaultOpen
      className="group/collapsible"
      key="unavailable-members">
      <div className="p-2">
        <CollapsibleTrigger className="w-full">
          <div className="flex w-full flex-row items-center justify-between">
            <Label>Unavailable Members</Label>
            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-y-2 pt-2">
            {unavailableMembers.map(member => (
              <MemberItem
                key={member.name}
                member={member}
                onDelete={onDeleteMember}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
