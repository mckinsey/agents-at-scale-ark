'use client';

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Code,
  Copy,
  Download,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { EmbeddedChatPanel } from '@/components/chat/embedded-chat-panel';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { type Agent, agentsService } from '@/lib/services';

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

export function AgentForm({
  mode,
  agentName,
  onSuccess,
  onCancel,
}: AgentFormProps) {
  const router = useRouter();
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [copied, setCopied] = useState(false);

  const isViewing = mode === AgentFormMode.VIEW;

  useEffect(() => {
    if (isViewing) {
      setAgentsLoading(true);
      agentsService
        .getAll()
        .then(agents => setAllAgents(agents))
        .catch(console.error)
        .finally(() => setAgentsLoading(false));
    }
  }, [isViewing]);

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
  const descriptionValue = form.watch('description') || '';
  const modelNameValue = form.watch('selectedModelName') || '';
  const modelNamespaceValue = form.watch('selectedModelNamespace') || '';
  const isA2A = agent?.isA2A ?? false;
  const isEditing = mode === AgentFormMode.EDIT;
  const isDisabled = form.formState.isSubmitting;
  const hasUnavailableTools = unavailableTools.length > 0;

  const agentYaml = useMemo(() => {
    if (!agent) return '';

    const selectedToolsList = availableTools.filter(t =>
      state.selectedTools.some(st => st.name === t.name),
    );

    const lines: string[] = [
      'apiVersion: ark.mckinsey.com/v1alpha1',
      'kind: Agent',
      'metadata:',
      `  name: ${agent.name}`,
      `  namespace: ${agent.namespace}`,
      'spec:',
    ];

    if (descriptionValue) {
      lines.push(`  description: ${descriptionValue}`);
    }

    if (modelNameValue && modelNameValue !== '__none__') {
      lines.push('  modelRef:');
      lines.push(`    name: ${modelNameValue}`);
      if (modelNamespaceValue) {
        lines.push(`    namespace: ${modelNamespaceValue}`);
      }
    }

    if (promptValue) {
      lines.push('  prompt: |');
      promptValue.split('\n').forEach(line => {
        lines.push(`    ${line}`);
      });
    }

    if (parameters.length > 0) {
      lines.push('  parameters:');
      parameters.forEach(param => {
        lines.push(`    - name: ${param.name}`);
        if (param.value) {
          lines.push(`      value: ${param.value}`);
        }
      });
    }

    if (selectedToolsList.length > 0) {
      lines.push('  tools:');
      selectedToolsList.forEach(tool => {
        lines.push(`    - type: custom`);
        lines.push(`      name: ${tool.name}`);
      });
    }

    return lines.join('\n');
  }, [
    agent,
    descriptionValue,
    modelNameValue,
    modelNamespaceValue,
    promptValue,
    parameters,
    availableTools,
    state.selectedTools,
  ]);

  const handleCopyYaml = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(agentYaml).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = agentYaml;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadYaml = () => {
    const blob = new Blob([agentYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent?.name || 'agent'}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if ((isEditing || isViewing) && !agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Agent not found</div>
      </div>
    );
  }

  const pageTitle = isViewing
    ? agent?.name || ''
    : isEditing
      ? `Edit ${agent?.name}`
      : 'Create Agent';
  const submitButtonText = isEditing ? 'Save Changes' : 'Create Agent';
  const cancelHref = onCancel ? undefined : '/agents';

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          breadcrumbs={breadcrumbs}
          currentPage={pageTitle}
          actions={
            isViewing ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/agents">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Link>
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={saving || !hasChanges}>
                  {saving ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            ) : (
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
            )
          }
        />
      </div>

      {isViewing ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Left Panel - Configuration */}
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden border-r transition-all duration-300 ${
              isLeftPanelCollapsed ? 'w-0 border-r-0' : 'w-1/2'
            }`}>
            {!isLeftPanelCollapsed && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
                  <Settings className="text-muted-foreground h-4 w-4" />
                  <Select
                    value={agentName}
                    onValueChange={value => router.push(`/agents/${value}`)}>
                    <SelectTrigger className="border-border h-8 w-[180px] bg-transparent px-2 text-sm font-medium">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentsLoading ? (
                        <SelectItem value="loading" disabled>
                          Loading...
                        </SelectItem>
                      ) : (
                        allAgents.map(a => (
                          <SelectItem key={a.name} value={a.name}>
                            {a.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={showYaml ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setShowYaml(!showYaml)}
                    className="h-7 gap-1 px-2 text-xs">
                    <Code className="h-3 w-3" />
                    YAML
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {showYaml ? (
                    <div className="relative h-full">
                      <div className="absolute top-2 right-4 z-10 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyYaml}
                          className="h-7 gap-1 px-2 text-xs">
                          {copied ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDownloadYaml}
                          className="h-7 gap-1 px-2 text-xs">
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </div>
                      <pre className="bg-muted/30 h-full overflow-auto p-4 pt-10 font-mono text-xs">
                        {agentYaml}
                      </pre>
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      <Form {...form}>
                        <BasicInfoSection
                          form={form}
                          mode={mode}
                          disabled={isDisabled}
                        />

                        {!isA2A && (
                          <ModelConfigSection
                            form={form}
                            models={models}
                            showExecutionEngine={
                              isExperimentalExecutionEngineEnabled
                            }
                            disabled={isDisabled}
                          />
                        )}

                        {!isA2A && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <FileText className="text-muted-foreground h-4 w-4" />
                              <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                Prompt
                              </h3>
                              {promptValue.length > 0 && (
                                <span className="text-muted-foreground ml-auto text-xs">
                                  {promptValue.length} chars ·{' '}
                                  {promptValue.split('\n').length} lines
                                </span>
                              )}
                            </div>
                            <FormField
                              control={form.control}
                              name="prompt"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <PromptEditor
                                      value={field.value || ''}
                                      onChange={field.onChange}
                                      disabled={isDisabled}
                                      parameters={parameters}
                                      className="min-h-[350px]"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                        {!isA2A && (
                          <ParameterEditor
                            parameters={parameters}
                            onChange={setParameters}
                            prompt={promptValue}
                            disabled={isDisabled}
                          />
                        )}

                        {isA2A ? (
                          <SkillsDisplaySection skills={agent?.skills || []} />
                        ) : (
                          <ToolSelectionSection
                            availableTools={availableTools}
                            toolsLoading={toolsLoading}
                            onToolToggle={handleToolToggle}
                            isToolSelected={isToolSelected}
                            disabled={isDisabled}
                          />
                        )}
                      </Form>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Toggle button */}
          <Button
            variant="outline"
            size="sm"
            className={`absolute top-1/2 z-10 h-12 w-6 -translate-y-1/2 rounded-l-none rounded-r-md border-l-0 px-0 transition-all duration-300 ${
              isLeftPanelCollapsed ? 'left-0' : 'left-1/2 -translate-x-px'
            }`}
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            title={
              isLeftPanelCollapsed ? 'Show configuration' : 'Hide configuration'
            }>
            {isLeftPanelCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>

          {/* Right Panel - Chat */}
          <div
            className={`flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300 ${
              isLeftPanelCollapsed ? 'w-full' : 'w-1/2'
            }`}>
            <EmbeddedChatPanel name={agentName || ''} type="agent" />
          </div>
        </div>
      ) : (
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
                    mode={mode}
                    disabled={isDisabled}
                  />

                  {/* Model Configuration Section */}
                  {!isA2A && (
                    <ModelConfigSection
                      form={form}
                      models={models}
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
                      unavailableTools={
                        isEditing ? unavailableTools : undefined
                      }
                      onDeleteClick={isEditing ? handleDeleteTool : undefined}
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
      )}
    </div>
  );
}
