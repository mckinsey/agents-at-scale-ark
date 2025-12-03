'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  agentIsExternal,
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

  const [{ isDragging }, drag] = useDrag({
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
      className="mb-2 cursor-move border border-gray-300 bg-white p-2 text-sm shadow"
      style={{ opacity: isDragging ? 0.4 : 1 }}>
      <label
        className={cn(
          'flex cursor-pointer items-center space-x-2 rounded p-1',
          isSelected ? 'hover:bg-accent' : 'opacity-50',
        )}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleMember(agent)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="flex items-center gap-1 text-sm">
          {agent.name}
          {agentIsExternal && (
            <Badge variant="outline" className="text-xs">
              External
            </Badge>
          )}
        </span>
        {agent.description && (
          <span className="text-muted-foreground text-xs">
            - {agent.description}
          </span>
        )}
      </label>
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
  const maxTurnsValue = form.watch('maxTurns');
  const selectorAgentValue = form.watch('selectorAgent');

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name,
        description: team.description ?? '',
        strategy: team.strategy || 'round-robin',
        maxTurns: team.maxTurns ? String(team.maxTurns) : '',
        selectorAgent: team.selector?.agent ?? '',
        selectorPrompt: team.selector?.selectorPrompt ?? '',
      });
      setSelectedMembers(team.members || []);
      setGraphEdges(team.graph?.edges || []);
    } else {
      form.reset();
      setSelectedMembers([]);
      setGraphEdges([]);
      setOrderedAgents(agents);
    }
  }, [team, open, agents, form]);

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
    // Validate members
    if (selectedMembers.length === 0) {
      form.setError('name', {
        message: 'At least one team member is required',
      });
      return;
    }

    // Validate graph strategy requirements
    if (
      selectedStrategy === 'graph' &&
      (!values.maxTurns || graphEdges.length === 0 || !graphEdges.every(edge => edge.to))
    ) {
      form.setError('maxTurns', {
        message: 'Graph strategy requires max turns and at least one valid edge',
      });
      return;
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
                    <FormLabel>Max Turns</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 10"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    {selectedStrategy === 'graph' && !field.value && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          Graph strategy requires Max Turns to be set
                        </AlertDescription>
                      </Alert>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
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
                {selectedMembers.length === 0 && (
                  <p className="text-sm text-red-500">
                    At least one member is required
                  </p>
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
                          Selector Agent{' '}
                          <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an agent" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None (Unset)
                              </span>
                            </SelectItem>
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
                    <Label>Graph Edges</Label>
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
                      graphEdges.map((edge, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={edge.from || ''}
                            onValueChange={value =>
                              updateGraphEdge(index, 'from', value)
                            }
                            disabled={form.formState.isSubmitting}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="From (optional)" />
                            </SelectTrigger>
                            <SelectContent>
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
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="To (required)" />
                            </SelectTrigger>
                            <SelectContent>
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
                      ))
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {selectedStrategy === 'graph' ? (
                      <>
                        Define the flow between agents. &quot;From&quot; is
                        optional and defaults to any agent.
                      </>
                    ) : (
                      <>
                        Optional: Define graph constraints to limit AI selection
                        to valid transitions. When provided, the selector agent
                        will only choose from members that are legal according to
                        the graph edges.
                      </>
                    )}
                  </p>
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
