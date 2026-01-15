'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAtomValue } from 'jotai';
import {
  ChevronRight,
  CircleAlert,
  Maximize2,
  Minimize2,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { isExperimentalExecutionEngineEnabledAtom } from '@/atoms/experimental-features';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  Agent,
  AgentCreateRequest,
  AgentTool,
  AgentUpdateRequest,
  Model,
  Skill,
  Team,
  Tool,
} from '@/lib/services';
import { toolsService } from '@/lib/services';
import { groupToolsByLabel } from '@/lib/utils/groupToolsByLabels';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';

interface AgentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  models: Model[];
  teams: Team[];
  onSave: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string },
  ) => void;
}

const formSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  selectedModelName: z.string().optional(),
  selectedModelNamespace: z.string().optional(),
  executionEngineName: z.string().optional(),
  prompt: z.string().optional(),
});

export function AgentEditor({
  open,
  onOpenChange,
  agent,
  models,
  onSave,
}: Readonly<AgentEditorProps>) {
  const [selectedTools, setSelectedTools] = useState<AgentTool[]>([]);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [unavailableTools, setUnavailableTools] = useState<Tool[]>([]);
  const isExperimentalExecutionEngineEnabled = useAtomValue(
    isExperimentalExecutionEngineEnabledAtom,
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      selectedModelName: '__none__',
      selectedModelNamespace: '',
      executionEngineName: '',
      prompt: '',
    },
  });

  useEffect(() => {
    if (open) {
      const loadTools = async () => {
        setToolsLoading(true);
        try {
          const tools = await toolsService.getAll();
          const missingTools = agent?.tools?.filter(
            agentTool => !tools.some(t => t.name === agentTool.name),
          ) as Tool[];
          setUnavailableTools(missingTools || []);
          setAvailableTools(tools);
        } catch (error) {
          console.error('Failed to load tools:', error);
          setAvailableTools([]);
          setUnavailableTools([]);
        } finally {
          setToolsLoading(false);
        }
      };
      loadTools();
    }
  }, [open, agent?.tools]);

  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name,
        description: agent.description || '',
        selectedModelName: agent.modelRef?.name || '__none__',
        selectedModelNamespace: agent.modelRef?.namespace || '',
        executionEngineName: agent.executionEngine?.name || '',
        prompt: agent.prompt || '',
      });
      setSelectedTools(agent.tools || []);
    } else {
      form.reset();
      setSelectedTools([]);
      setIsPromptExpanded(false);
    }
  }, [open, agent, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (agent) {
      const updateData: AgentUpdateRequest & { id: string } = {
        description: values.description || undefined,
        modelRef:
          !agent.isA2A &&
          values.selectedModelName &&
          values.selectedModelName !== '' &&
          values.selectedModelName !== '__none__'
            ? {
                name: values.selectedModelName,
                namespace: values.selectedModelNamespace || undefined,
              }
            : undefined,
        executionEngine:
          !agent.isA2A && values.executionEngineName
            ? {
                name: values.executionEngineName,
              }
            : undefined,
        prompt: !agent.isA2A ? values.prompt || undefined : undefined,
        tools: agent.isA2A ? undefined : selectedTools,
        id: agent.id,
      };
      onSave(updateData);
    } else {
      const createData: AgentCreateRequest = {
        name: values.name,
        description: values.description || undefined,
        modelRef:
          values.selectedModelName &&
          values.selectedModelName !== '' &&
          values.selectedModelName !== '__none__'
            ? {
                name: values.selectedModelName,
                namespace: values.selectedModelNamespace || undefined,
              }
            : undefined,
        executionEngine: values.executionEngineName
          ? {
              name: values.executionEngineName,
            }
          : undefined,
        prompt: values.prompt || undefined,
        tools: selectedTools,
      };
      onSave(createData);
    }
    onOpenChange(false);
  };

  const handleToolToggle = (tool: Tool, checked: boolean) => {
    if (checked) {
      const newTool: AgentTool = {
        type: tool.type || 'http',
        name: tool.name,
      };
      setSelectedTools(prev => [...prev, newTool]);
    } else {
      setSelectedTools(prev => prev.filter(t => t.name !== tool.name));
    }
  };

  const onDeleteClick = (tool: Tool) => {
    setUnavailableTools(prev =>
      prev.filter(unavailableTool => unavailableTool.name !== tool.name),
    );
    setSelectedTools(prev => prev.filter(t => t.name !== tool.name));
  };
  const isToolSelected = (toolName: string) => {
    return selectedTools.some(t => t.name === toolName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent ? 'Edit Agent' : 'Create New Agent'}</DialogTitle>
          <DialogDescription>
            {agent
              ? 'Update the agent information below.'
              : 'Fill in the information for the new agent.'}
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
                        placeholder="e.g., customer-support-agent"
                        disabled={!!agent || form.formState.isSubmitting}
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
                        placeholder="e.g., Handles customer inquiries and support tickets"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!agent?.isA2A && (
                <>
                  <FormField
                    control={form.control}
                    name="selectedModelName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None (Unset)
                              </span>
                            </SelectItem>
                            {models.map(model => (
                              <SelectItem key={model.name} value={model.name}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {isExperimentalExecutionEngineEnabled && (
                    <FormField
                      control={form.control}
                      name="executionEngineName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Execution Engine</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., langchain-executor"
                              disabled={form.formState.isSubmitting}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="prompt"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Prompt</FormLabel>
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
                                setIsPromptExpanded(!isPromptExpanded)
                              }
                              className="h-8 px-2">
                              {isPromptExpanded ? (
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
                            placeholder="Enter the agent's prompt or instructions..."
                            disabled={form.formState.isSubmitting}
                            className={`resize-none transition-all duration-200 ${
                              isPromptExpanded
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
                        {isPromptExpanded &&
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

              {agent?.isA2A ? (
                <SkillsDisplaySection skills={agent.skills || []} />
              ) : (
                <ToolSelectionSection
                  availableTools={availableTools}
                  toolsLoading={toolsLoading}
                  onToolToggle={handleToolToggle}
                  isToolSelected={isToolSelected}
                  unavailableTools={unavailableTools}
                  onDeleteClick={onDeleteClick}
                />
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
                          unavailableTools.length > 0
                        }>
                        {form.formState.isSubmitting
                          ? 'Saving...'
                          : agent
                            ? 'Update'
                            : 'Create'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {unavailableTools.length > 0
                        ? 'Delete all unavailable tools to proceed'
                        : ''}{' '}
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

const ToolItem = ({
  tool,
  isSelected,
  onToggle,
  isUnavailable,
  onDeleteClick,
}: {
  tool: Tool;
  isSelected: boolean;
  onToggle: (tool: Tool, checked: boolean) => void;
  isUnavailable: boolean;
  onDeleteClick: (tool: Tool) => void;
}) => (
  <div className="flex flex-row justify-between" key={`tool-${tool.id}`}>
    <div className="flex w-fit items-start space-x-2">
      {isUnavailable ? (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left" tabIndex={-1}>
                <CircleAlert className="mt-1 h-4 w-4 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>This tool is unavailable in the system</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      ) : (
        <Checkbox
          id={`tool-${tool.id}`}
          checked={isSelected}
          onCheckedChange={checked => onToggle(tool, checked)}
          className="mt-1"
        />
      )}
      <Label
        htmlFor={`tool-${tool.id}`}
        className="flex-1 cursor-pointer text-sm font-normal">
        <div className="font-medium">{tool.name}</div>
        {tool.description && (
          <div className="text-muted-foreground text-xs">
            {tool.description}
          </div>
        )}
      </Label>
    </div>
    <div>
      {isUnavailable && (
        <Button
          variant={'ghost'}
          size="sm"
          className="h-8 w-8 p-0 hover:text-red-500"
          onClick={() => onDeleteClick(tool)}
          aria-label={'Delete tool'}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  </div>
);

const ToolGroup = ({
  toolGroup,
  onToggle,
  isToolSelected,
  unavailableTools,
  onDeleteClick,
}: {
  toolGroup: { groupName: string; tools: Tool[] };
  onToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (name: string) => boolean;
  unavailableTools: Tool[];
  onDeleteClick: (tool: Tool) => void;
}) => (
  <Collapsible
    defaultOpen
    className="group/collapsible"
    key={toolGroup.groupName}>
    <div className="p-2">
      <CollapsibleTrigger className="w-full">
        <div className="flex w-full flex-row items-center justify-between">
          <Label>{toolGroup.groupName}</Label>
          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-y-2 pt-2">
          {toolGroup.tools?.map(tool => (
            <ToolItem
              key={`tool-${tool.id ? tool.id : tool.name}`}
              tool={tool}
              isSelected={isToolSelected(tool.name)}
              onToggle={onToggle}
              isUnavailable={unavailableTools.some(
                unavailableTool => unavailableTool.name === tool.name,
              )}
              onDeleteClick={onDeleteClick}
            />
          ))}
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
);

interface ToolSelectionSectionProps {
  availableTools: Tool[];
  toolsLoading: boolean;
  onToolToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (toolName: string) => boolean;
  unavailableTools: Tool[];
  onDeleteClick: (tool: Tool) => void;
}

function ToolSelectionSection({
  availableTools,
  toolsLoading,
  onToolToggle,
  isToolSelected,
  unavailableTools,
  onDeleteClick,
}: Readonly<ToolSelectionSectionProps>) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = [...availableTools].filter(
    tool =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool?.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const groupedTools = useMemo(
    () => groupToolsByLabel(filteredTools),
    [filteredTools],
  );

  const renderGroupedTools = () => {
    return (
      <>
        <ToolGroup
          key={'unavailable-tools'}
          toolGroup={{
            groupName: 'Unavailable Tools',
            tools: [...unavailableTools],
          }}
          onToggle={onToolToggle}
          isToolSelected={isToolSelected}
          unavailableTools={unavailableTools}
          onDeleteClick={onDeleteClick}
        />
        {groupedTools?.map((toolGroup, index) => (
          <ToolGroup
            key={`${toolGroup.groupName}-${index}`}
            toolGroup={toolGroup}
            onToggle={onToolToggle}
            isToolSelected={isToolSelected}
            unavailableTools={unavailableTools}
            onDeleteClick={onDeleteClick}
          />
        ))}
      </>
    );
  };

  const renderTools = () => {
    if (availableTools.length === 0 && unavailableTools.length === 0) {
      return (
        <div className="text-muted-foreground text-sm">
          No tools available in this namespace
        </div>
      );
    } else {
      return (
        <>
          <Input
            placeholder="Filter tools..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-sm"
          />
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
            {filteredTools.length === 0 && searchQuery ? (
              <div className="text-muted-foreground py-2 text-center text-sm">
                {searchQuery
                  ? `No tools found matching "${searchQuery}"`
                  : 'No tools available'}
              </div>
            ) : (
              renderGroupedTools()
            )}
          </div>
        </>
      );
    }
  };
  return (
    <div className="grid gap-2">
      <Label>Tools</Label>
      <div className="space-y-2">
        {toolsLoading ? (
          <div className="text-muted-foreground text-sm">Loading tools...</div>
        ) : (
          renderTools()
        )}
      </div>
    </div>
  );
}

interface SkillsDisplaySectionProps {
  skills: Skill[];
}

function SkillsDisplaySection({ skills }: Readonly<SkillsDisplaySectionProps>) {
  return (
    <div className="grid gap-2">
      <Label>Skills</Label>
      <div className="space-y-2">
        {skills.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            No skills available for this agent
          </div>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
            {skills.map((skill, index) => (
              <div
                key={`${skill.id}-${index}`}
                className="space-y-1 rounded border-l-2 border-blue-200 bg-blue-50 p-2">
                <div className="text-sm font-medium">{skill.name}</div>
                {skill.description && (
                  <div className="text-muted-foreground text-xs">
                    {skill.description}
                  </div>
                )}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.tags.map((tag, tagIndex) => (
                      <span
                        key={`${tag}-${tagIndex}`}
                        className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
