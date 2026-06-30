'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import { PanelToggleButton } from '@/components/common/panel-toggle-button';
import { ResourceSwitcherBar } from '@/components/common/resource-switcher-bar';
import { YamlViewer } from '@/components/common/yaml-viewer';
import { ChevronLeft, Warning } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
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
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { type Agent, agentsService } from '@/lib/services';
import { cn } from '@/lib/utils';
import { toKubernetesYaml } from '@/lib/utils/kubernetes-yaml';
import { useNamespace } from '@/providers/NamespaceProvider';

import { SkillsDisplaySection } from './sections';
import { ToolsMultiSelect } from './sections/tools-multi-select';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const inlineFieldTriggerClass =
  'border-stroke-tertiary hover:border-stroke-secondary focus-visible:border-stroke-status-focus w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-left transition-colors focus:ring-0 focus-visible:ring-0';

export function ViewAgentForm({
  agentName,
  onSuccess,
}: Readonly<AgentFormProps>) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [agentYaml, setAgentYaml] = useState('');

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

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden px-12 pb-10">
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
                          render={({ field, fieldState }) => (
                            <FieldSet className="gap-2">
                              <FieldTitle>Prompt</FieldTitle>
                              <PromptEditor
                                variant="compact"
                                showSublabel={false}
                                showFooter={false}
                                value={field.value || ''}
                                onChange={field.onChange}
                                placeholder="Hint the agent objective here..."
                                disabled={isDisabled}
                                parameters={parameters}
                                className={cn(
                                  'border-stroke-divider focus-within:border-stroke-status-focus min-h-[248px] border bg-transparent pb-3 transition-colors',
                                  fieldState.error && 'border-status-error',
                                )}
                              />
                              <FieldError>
                                {fieldState.error?.message}
                              </FieldError>
                            </FieldSet>
                          )}
                        />
                      )}

                      {!isA2A && (
                        <ParameterEditor
                          parameters={parameters}
                          onChange={setParameters}
                          prompt={promptValue}
                          disabled={isDisabled}
                        />
                      )}

                      {!isA2A && (
                        <FieldSet className="gap-2">
                          <FieldTitle>Tools</FieldTitle>
                          <ToolsMultiSelect
                            availableTools={availableTools}
                            isToolSelected={isToolSelected}
                            onToggle={handleToolToggle}
                            toolsLoading={toolsLoading}
                            disabled={isDisabled}
                            unavailableTools={unavailableTools}
                            onDeleteUnavailable={handleDeleteTool}
                            triggerClassName={inlineFieldTriggerClass}
                          />
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
