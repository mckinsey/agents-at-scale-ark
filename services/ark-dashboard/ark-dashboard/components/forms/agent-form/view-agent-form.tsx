'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
import { ResourceStudioLayout } from '@/components/common/resource-studio-layout';
import { YamlViewer } from '@/components/common/yaml-viewer';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
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
import { toKubernetesYaml } from '@/lib/utils/kubernetes-yaml';
import { useNamespace } from '@/providers/NamespaceProvider';

import { PromptField } from './prompt-field';
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
  const { namespace, readOnlyMode } = useNamespace();
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [agentYaml, setAgentYaml] = useState('');

  useEffect(() => {
    setAgentsLoading(true);
    agentsService
      .getAll(namespace)
      .then(agents => setAllAgents(agents))
      .catch(console.error)
      .finally(() => setAgentsLoading(false));
  }, [namespace]);

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
      const raw = await agentsService.getRawResource(namespace, name);
      setAgentYaml(toKubernetesYaml(raw));
    } catch {
      setAgentYaml('');
    }
  }, [namespace]);

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
    <ResourceStudioLayout
      listHref="/agents"
      listLabel="Agents"
      displayName={displayName}
      saving={saving}
      hasChanges={hasChanges}
      readOnlyMode={readOnlyMode}
      onSave={form.handleSubmit(onSubmit)}
      switcherValue={agentName}
      switcherPlaceholder="Select agent"
      switcherItems={allAgents}
      switcherLoading={agentsLoading}
      onSwitcherSelect={value => push(`/agents/${value}`)}
      showYaml={showYaml}
      onToggleYaml={() => setShowYaml(!showYaml)}
      yamlContent={
        <YamlViewer yaml={agentYaml} fileName={agent?.name || 'agent'} />
      }
      formContent={
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
                            <PromptField
                              value={field.value || ''}
                              onChange={field.onChange}
                              error={fieldState.error?.message}
                              hasError={!!fieldState.error}
                              disabled={isDisabled}
                              parameters={parameters}
                            />
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
      }
      chatPanel={<EmbeddedChatPanel name={agentName || ''} type="agent" />}
    />
  );
}
