'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { ResourceSwitcherBar } from '@/components/common/resource-switcher-bar';
import { YamlViewer } from '@/components/common/yaml-viewer';
import {
  ChevronDown,
  ChevronLeft,
  ExpandContent,
  Warning,
} from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { NumericBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PromptEditor } from '@/components/ui/prompt-editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { type Agent, agentsService } from '@/lib/services';
import { cn } from '@/lib/utils';
import { toKubernetesYaml } from '@/lib/utils/kubernetes-yaml';
import { useNamespace } from '@/providers/NamespaceProvider';

import { SkillsDisplaySection } from './sections';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const MAX_VISIBLE_TOOL_TAGS = 4;

const inlineFieldTriggerClass =
  'border-stroke-tertiary hover:border-stroke-secondary focus-visible:border-stroke-status-focus w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-left transition-colors focus:ring-0 focus-visible:ring-0';

export function ViewAgentForm({ agentName, onSuccess }: AgentFormProps) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [agentYaml, setAgentYaml] = useState('');
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [toolsPopoverOpen, setToolsPopoverOpen] = useState(false);

  useEffect(() => {
    setAgentsLoading(true);
    agentsService
      .getAll()
      .then(agents => setAllAgents(agents))
      .catch(console.error)
      .finally(() => setAgentsLoading(false));
  }, []);

  const { form, state, actions } = useAgentForm({
    mode: AgentFormMode.VIEW,
    agentName,
    onSuccess,
  });

  const {
    loading,
    saving,
    agent,
    models,
    executionEngines,
    availableTools,
    toolsLoading,
    unavailableTools,
    parameters,
    isExperimentalExecutionEngineEnabled,
    hasChanges,
  } = state;

  const {
    setParameters,
    handleToolToggle,
    handleDeleteTool,
    isToolSelected,
    onSubmit,
  } = actions;

  const promptValue = form.watch('prompt') || '';
  const isA2A = agent?.isA2A ?? false;
  const isDisabled = form.formState.isSubmitting;

  const fetchAgentYaml = useCallback(async (name: string) => {
    try {
      const raw = await agentsService.getRawResource(name);
      setAgentYaml(toKubernetesYaml(raw));
    } catch {
      setAgentYaml('');
    }
  }, []);

  useEffect(() => {
    if (agent?.name && showYaml) {
      fetchAgentYaml(agent.name);
    }
  }, [agent?.name, showYaml, fetchAgentYaml]);

  const prevSavingRef = useRef(false);
  useEffect(() => {
    if (prevSavingRef.current && !saving && agent?.name && showYaml) {
      fetchAgentYaml(agent.name);
    }
    prevSavingRef.current = saving;
  }, [saving, agent?.name, showYaml, fetchAgentYaml]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-fg-secondary">Agent not found</div>
      </div>
    );
  }

  const displayName = agent?.name || '';
  const selectedTools = availableTools.filter(t => isToolSelected(t.name));
  const visibleSelectedTools = selectedTools.slice(0, MAX_VISIBLE_TOOL_TAGS);
  const overflowSelectedCount =
    selectedTools.length - visibleSelectedTools.length;
  const toolsPlaceholder = toolsLoading ? 'Loading tools...' : 'Select tools';
  const toolsTriggerDisabled = isDisabled || toolsLoading;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden px-20 pb-10">
      <header className="flex flex-none flex-col gap-4 pt-10 pb-5">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <NamespacedLink
              href="/agents"
              className="text-fg-disabled hover:text-fg-secondary flex items-center gap-1 transition-colors">
              <IconShell size="sm" className="opacity-100">
                <ChevronLeft />
              </IconShell>
              Agents
            </NamespacedLink>
            <span aria-hidden="true" className="text-fg-secondary">
              /
            </span>
            <span aria-current="page" className="text-fg-secondary">
              {displayName}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <NamespacedLink href="/agents">
              <Button variant="outline">Back</Button>
            </NamespacedLink>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving || !hasChanges || readOnlyMode}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <h1 className="text-fg-primary text-xl leading-7">{displayName}</h1>
          {hasChanges && (
            <div className="flex items-center gap-1">
              <IconShell size="sm" className="text-status-warning opacity-100">
                <Warning />
              </IconShell>
              <span className="text-fg-primary text-sm leading-5 tracking-[-0.112px]">
                You have unsaved changes
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`border-stroke-divider flex h-full min-h-0 flex-col overflow-hidden border-r transition-all duration-300 ${
            isLeftPanelCollapsed ? 'w-0 border-r-0' : 'w-1/2'
          }`}>
          {!isLeftPanelCollapsed && (
            <div className="flex min-h-0 flex-1 flex-col">
              <ResourceSwitcherBar
                value={agentName}
                placeholder="Select agent"
                items={allAgents}
                loading={agentsLoading}
                onSelect={value => push(`/agents/${value}`)}
                showYaml={showYaml}
                onToggleYaml={() => setShowYaml(!showYaml)}
              />
              <ScrollArea className="h-0 min-h-0 flex-1">
                {showYaml ? (
                  <YamlViewer
                    yaml={agentYaml}
                    fileName={agent?.name || 'agent'}
                  />
                ) : (
                  <div className="flex flex-col gap-6 px-5 pt-5 pb-6">
                    <Form {...form}>
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field, fieldState }) => (
                          <FieldSet className="gap-2">
                            <FieldTitle>Description</FieldTitle>
                            <Input
                              variant="inline"
                              placeholder="e.g., Handles customer inquiries and support tickets"
                              disabled={isDisabled}
                              aria-invalid={!!fieldState.error}
                              {...field}
                            />
                            <FieldError>{fieldState.error?.message}</FieldError>
                          </FieldSet>
                        )}
                      />

                      {!isA2A && (
                        <FormField
                          control={form.control}
                          name="selectedModelName"
                          render={({ field, fieldState }) => {
                            const modelItems = [
                              { value: '__none__', label: 'None (Unset)' },
                              ...models.map(m => ({
                                value: m.name,
                                label: m.name,
                              })),
                            ];
                            return (
                              <FieldSet className="gap-2">
                                <FieldTitle>Model</FieldTitle>
                                <Select
                                  items={modelItems}
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  disabled={isDisabled}>
                                  <SelectTrigger
                                    className={inlineFieldTriggerClass}>
                                    <SelectValue placeholder="Select a model" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-fill-onsurface-ui-2">
                                    {modelItems.map(item => (
                                      <SelectItem
                                        key={item.value}
                                        value={item.value}>
                                        <SelectItemText>
                                          {item.label}
                                        </SelectItemText>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FieldError>
                                  {fieldState.error?.message}
                                </FieldError>
                              </FieldSet>
                            );
                          }}
                        />
                      )}

                      {!isA2A && isExperimentalExecutionEngineEnabled && (
                        <FormField
                          control={form.control}
                          name="executionEngineName"
                          render={({ field, fieldState }) => {
                            const engineItems = [
                              { value: '__none__', label: 'None (Unset)' },
                              ...executionEngines.map(e => ({
                                value: e.name,
                                label: e.name,
                              })),
                            ];
                            return (
                              <FieldSet className="gap-2">
                                <FieldTitle>Execution Engine</FieldTitle>
                                <Select
                                  items={engineItems}
                                  onValueChange={field.onChange}
                                  value={field.value || '__none__'}
                                  disabled={isDisabled}>
                                  <SelectTrigger
                                    className={inlineFieldTriggerClass}>
                                    <SelectValue placeholder="Select an execution engine" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-fill-onsurface-ui-2">
                                    {engineItems.map(item => (
                                      <SelectItem
                                        key={item.value}
                                        value={item.value}>
                                        <SelectItemText>
                                          {item.label}
                                        </SelectItemText>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FieldError>
                                  {fieldState.error?.message}
                                </FieldError>
                              </FieldSet>
                            );
                          }}
                        />
                      )}

                      {!isA2A && (
                        <FormField
                          control={form.control}
                          name="prompt"
                          render={({ field }) => (
                            <FormItem className="gap-0 space-y-0">
                              <FormControl>
                                <div className="border-stroke-divider focus-within:border-stroke-status-focus flex flex-col border transition-colors">
                                  <div className="bg-surface-secondary border-stroke-divider flex h-12 items-center justify-between border-b px-3">
                                    <span className="text-fg-primary text-sm leading-5 tracking-[-0.028px]">
                                      Agent Prompt
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={
                                        promptExpanded
                                          ? 'Collapse prompt'
                                          : 'Expand prompt'
                                      }
                                      onClick={() =>
                                        setPromptExpanded(v => !v)
                                      }>
                                      <IconShell size="sm" variant="secondary">
                                        <ExpandContent />
                                      </IconShell>
                                    </Button>
                                  </div>
                                  <PromptEditor
                                    variant="compact"
                                    showSublabel={false}
                                    showFooter={false}
                                    value={field.value || ''}
                                    onChange={field.onChange}
                                    disabled={isDisabled}
                                    parameters={parameters}
                                    className={cn(
                                      'bg-transparent transition-[min-height] duration-200',
                                      promptExpanded
                                        ? 'min-h-[600px]'
                                        : 'min-h-[350px]',
                                    )}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {!isA2A && (
                        <ParameterEditor
                          variant="compact"
                          parameters={parameters}
                          onChange={setParameters}
                          prompt={promptValue}
                          disabled={isDisabled}
                        />
                      )}

                      {!isA2A && (
                        <FieldSet className="gap-2">
                          <FieldTitle>Tools</FieldTitle>
                          <Popover
                            open={toolsPopoverOpen}
                            onOpenChange={setToolsPopoverOpen}>
                            <PopoverTrigger asChild>
                              <div
                                role="combobox"
                                aria-expanded={toolsPopoverOpen}
                                aria-haspopup="listbox"
                                aria-disabled={toolsTriggerDisabled || undefined}
                                tabIndex={toolsTriggerDisabled ? -1 : 0}
                                onKeyDown={e => {
                                  if (
                                    (e.key === 'Enter' || e.key === ' ') &&
                                    !toolsTriggerDisabled
                                  ) {
                                    e.preventDefault();
                                    setToolsPopoverOpen(o => !o);
                                  }
                                }}
                                className={cn(
                                  'flex min-h-9 w-full cursor-pointer items-center justify-between gap-2',
                                  inlineFieldTriggerClass,
                                  'data-[state=open]:border-stroke-status-focus',
                                  'aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                                )}>
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                  {selectedTools.length === 0 ? (
                                    <span className="text-fg-tertiary text-sm leading-5 tracking-[-0.028px]">
                                      {toolsPlaceholder}
                                    </span>
                                  ) : (
                                    <>
                                      {visibleSelectedTools.map(tool => (
                                        <Tag
                                          key={tool.name}
                                          size="xs"
                                          variant="primary"
                                          onPointerDown={e =>
                                            e.stopPropagation()
                                          }
                                          onRemove={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleToolToggle(tool, false);
                                          }}>
                                          {tool.name}
                                        </Tag>
                                      ))}
                                      {overflowSelectedCount > 0 && (
                                        <NumericBadge size="sm" variant="primary">
                                          {overflowSelectedCount}
                                        </NumericBadge>
                                      )}
                                    </>
                                  )}
                                </div>
                                <IconShell
                                  size="sm"
                                  variant="secondary"
                                  className={cn(
                                    'shrink-0 transition-transform',
                                    toolsPopoverOpen && 'rotate-180',
                                  )}>
                                  <ChevronDown />
                                </IconShell>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              side="bottom"
                              align="start"
                              sideOffset={4}
                              avoidCollisions={false}
                              role="listbox"
                              aria-multiselectable="true"
                              className="bg-fill-onsurface-ui-2 shadow-elevation-2 max-h-[320px] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-none border-0 p-1">
                              {availableTools.length === 0 ? (
                                <p className="text-fg-secondary px-3 py-2 text-sm">
                                  No tools available in this namespace.
                                </p>
                              ) : (
                                <ul className="flex flex-col">
                                  {availableTools.map(tool => {
                                    const checked = isToolSelected(tool.name);
                                    const description = tool.description?.trim();
                                    const labelNode = (
                                      <span className="text-fg-primary text-sm leading-5 tracking-[-0.028px]">
                                        {tool.name}
                                      </span>
                                    );
                                    return (
                                      <li
                                        key={tool.name}
                                        role="option"
                                        aria-selected={checked}>
                                        <label className="hover:bg-stateslayer-overlay-hover flex h-9 cursor-pointer items-center gap-2 px-1">
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={value =>
                                              handleToolToggle(
                                                tool,
                                                value === true,
                                              )
                                            }
                                            disabled={isDisabled}
                                            aria-label={tool.name}
                                          />
                                          {description ? (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="text-fg-primary cursor-pointer text-sm leading-5 tracking-[-0.028px]">
                                                  {tool.name}
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="bottom"
                                                align="start">
                                                {description}
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            labelNode
                                          )}
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </PopoverContent>
                          </Popover>
                          {unavailableTools.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {unavailableTools.map(tool => (
                                <Tag
                                  key={tool.name}
                                  size="xs"
                                  variant="outline"
                                  className="border-status-error text-status-error"
                                  onRemove={() => handleDeleteTool(tool)}>
                                  {tool.name}
                                </Tag>
                              ))}
                            </div>
                          )}
                          {unavailableTools.length > 0 && (
                            <FieldDescription>
                              These tools are no longer available in this
                              namespace. Remove them before saving.
                            </FieldDescription>
                          )}
                        </FieldSet>
                      )}

                      {isA2A && (
                        <SkillsDisplaySection skills={agent?.skills || []} />
                      )}
                    </Form>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <PanelToggleButton
          isCollapsed={isLeftPanelCollapsed}
          onToggle={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
        />

        <div
          className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
            isLeftPanelCollapsed ? 'w-full' : 'w-1/2'
          }`}>
          <EmbeddedChatPanel name={agentName || ''} type="agent" />
        </div>
      </div>
    </div>
  );
}
