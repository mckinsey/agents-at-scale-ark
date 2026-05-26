'use client';

import {
  ArrowLeft,
  CircleAlert,
  FileText,
  Save,
  Settings,
} from 'lucide-react';

import { NamespacedLink } from '@/components/namespaced-link';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { ParameterEditor } from '@/components/ui/parameter-editor';
import { PromptEditor } from '@/components/ui/prompt-editor';
import { Spinner } from '@/components/ui/spinner';
import { useNamespace } from '@/providers/NamespaceProvider';

import {
  BasicInfoSection,
  ModelConfigSection,
  SkillsDisplaySection,
  ToolSelectionSection,
} from './sections';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'Ark Dashboard' },
  { href: '/agents', label: 'Agents' },
];

export function EditAgentForm({
  agentName,
  onSuccess,
  onCancel,
}: AgentFormProps) {
  const { readOnlyMode } = useNamespace();

  const { form, state, actions } = useAgentForm({
    mode: AgentFormMode.EDIT,
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
  const hasUnavailableTools = unavailableTools.length > 0;
  const cancelHref = onCancel ? undefined : '/agents';

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
        <div className="text-muted-foreground">Agent not found</div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          breadcrumbs={breadcrumbs}
          currentPage="Edit Agent"
          actions={
            <div className="flex items-center gap-2">
              {cancelHref ? (
                <NamespacedLink href={cancelHref}>
                  <Button variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </NamespacedLink>
              ) : (
                <Button variant="outline" onClick={onCancel}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={saving || hasUnavailableTools || readOnlyMode}>
                {saving ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          }
        />
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Panel - Prompt Editor */}
          {!isA2A && (
            <div className="flex h-full min-h-0 w-1/2 flex-col overflow-hidden border-r">
              <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-3">
                <FileText className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Agent Prompt</span>
                {promptValue.length > 0 && (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {promptValue.length} chars ·{' '}
                    {promptValue.split('\n').length} lines
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem className="h-full">
                      <FormControl>
                        <PromptEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Enter the agent's system prompt...

Use {{.parameterName}} for template variables.

Example:
You are a {{.role}} assistant for {{.company}}.
Environment: {{.environment}}"
                          disabled={isDisabled}
                          parameters={parameters}
                          className="h-full min-h-[500px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          {/* Right Panel - Configuration */}
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden ${isA2A ? 'w-full' : 'w-1/2'}`}>
            <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-3">
              <Settings className="text-muted-foreground h-4 w-4" />
              <span className="text-sm font-medium">Configuration</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-4 p-4">
                {/* Basic Info Section */}
                <BasicInfoSection
                  form={form}
                  mode={AgentFormMode.EDIT}
                  disabled={isDisabled}
                />

                {/* Model Configuration Section */}
                {!isA2A && (
                  <ModelConfigSection
                    form={form}
                    models={models}
                    executionEngines={executionEngines}
                    showExecutionEngine={isExperimentalExecutionEngineEnabled}
                    disabled={isDisabled}
                  />
                )}

                {/* Parameters Section */}
                {!isA2A && (
                  <ParameterEditor
                    parameters={parameters}
                    onChange={setParameters}
                    prompt={promptValue}
                    disabled={isDisabled}
                  />
                )}

                {/* Tools/Skills Section */}
                {isA2A ? (
                  <SkillsDisplaySection skills={agent?.skills || []} />
                ) : (
                  <ToolSelectionSection
                    availableTools={availableTools}
                    toolsLoading={toolsLoading}
                    onToolToggle={handleToolToggle}
                    isToolSelected={isToolSelected}
                    unavailableTools={unavailableTools}
                    onDeleteClick={handleDeleteTool}
                    disabled={isDisabled}
                  />
                )}

                {/* Warning for unavailable tools */}
                {hasUnavailableTools && (
                  <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-4">
                    <div className="text-destructive flex items-center gap-2 text-sm">
                      <CircleAlert className="h-4 w-4" />
                      <span>Remove all unavailable tools before saving</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
