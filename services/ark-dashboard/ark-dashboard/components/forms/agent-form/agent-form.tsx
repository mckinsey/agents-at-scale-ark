'use client';

import {
  ArrowLeft,
  CircleAlert,
  FileText,
  Save,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { ParameterEditor } from '@/components/ui/parameter-editor';
import { PromptEditor } from '@/components/ui/prompt-editor';
import { Spinner } from '@/components/ui/spinner';

import {
  BasicInfoSection,
  ModelConfigSection,
  SkillsDisplaySection,
  ToolSelectionSection,
} from './sections';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/agents', label: 'Agents' },
];

export function AgentForm({ mode, agentName, onSuccess, onCancel }: AgentFormProps) {
  const { form, state, actions } = useAgentForm({
    mode,
    agentName,
    onSuccess,
  });

  const {
    loading,
    saving,
    agent,
    models,
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
  const isEditing = mode === AgentFormMode.EDIT;
  const hasUnavailableTools = unavailableTools.length > 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isEditing && !agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Agent not found</div>
      </div>
    );
  }

  const pageTitle = isEditing ? `Edit ${agent?.name}` : 'Create Agent';
  const submitButtonText = isEditing ? 'Save Changes' : 'Create Agent';
  const cancelHref = onCancel ? undefined : '/agents';

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          breadcrumbs={breadcrumbs}
          currentPage={pageTitle}
          actions={
            <div className="flex items-center gap-2">
              {cancelHref ? (
                <Button variant="outline" asChild>
                  <Link href={cancelHref}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Cancel
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={onCancel}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={saving || hasUnavailableTools}>
                {saving ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {submitButtonText}
              </Button>
            </div>
          }
        />
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Panel - Prompt Editor */}
          {!isA2A && (
            <div className="flex min-h-0 h-full w-1/2 flex-col border-r overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Agent Prompt</span>
                {promptValue.length > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {promptValue.length} chars · {promptValue.split('\n').length} lines
                  </span>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
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
                          disabled={form.formState.isSubmitting}
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
            className={`flex min-h-0 h-full flex-col overflow-hidden ${isA2A ? 'w-full' : 'w-1/2'}`}>
            <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Configuration</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-6 p-6">
                {/* Basic Info Section */}
                <BasicInfoSection form={form} mode={mode} />

                {/* Model Configuration Section */}
                {!isA2A && (
                  <ModelConfigSection
                    form={form}
                    models={models}
                    showExecutionEngine={isExperimentalExecutionEngineEnabled}
                  />
                )}

                {/* Parameters Section */}
                {!isA2A && (
                  <ParameterEditor
                    parameters={parameters}
                    onChange={setParameters}
                    prompt={promptValue}
                    disabled={form.formState.isSubmitting}
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
                    unavailableTools={isEditing ? unavailableTools : undefined}
                    onDeleteClick={isEditing ? handleDeleteTool : undefined}
                  />
                )}

                {/* Warning for unavailable tools */}
                {hasUnavailableTools && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                    <div className="flex items-center gap-2 text-sm text-destructive">
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

