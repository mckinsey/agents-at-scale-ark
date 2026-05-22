'use client';

import { CircleAlert } from 'lucide-react';
import { useState } from 'react';

import { ChevronDown, ChevronLeft, Info } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PromptEditor } from '@/components/ui/prompt-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

export function CreateAgentForm({ onSuccess, onCancel }: AgentFormProps) {
  const { readOnlyMode } = useNamespace();

  const { form, state, actions } = useAgentForm({
    mode: AgentFormMode.CREATE,
    onSuccess,
  });

  const {
    saving,
    models,
    availableTools,
    toolsLoading,
    unavailableTools,
    parameters,
  } = state;

  const {
    setParameters,
    handleToolToggle,
    isToolSelected,
    onSubmit,
  } = actions;

  const promptValue = form.watch('prompt') || '';
  const isDisabled = form.formState.isSubmitting;
  const hasUnavailableTools = unavailableTools.length > 0;
  const cancelHref = onCancel ? undefined : '/agents';

  const [toolsPopoverOpen, setToolsPopoverOpen] = useState(false);
  const selectedToolCount = availableTools.filter(t =>
    isToolSelected(t.name),
  ).length;
  const toolsTriggerLabel = toolsLoading
    ? 'Loading tools...'
    : selectedToolCount > 0
      ? `${selectedToolCount} tool${selectedToolCount === 1 ? '' : 's'} selected`
      : 'Select tools';

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="flex-none">
        <PageHeader
          hideSidebarTrigger
          className="h-20 px-12"
          customBreadcrumb={
            <nav
              aria-label="Breadcrumb"
              className="-ml-5 flex items-center gap-1 text-sm leading-4 tracking-[-0.112px]">
              <ChevronLeft className="size-4 text-white/30" />
              <NamespacedLink
                href="/agents"
                className="text-white/30 transition-colors hover:text-white/60">
                Agents
              </NamespacedLink>
              <span aria-hidden="true" className="text-white/10">
                /
              </span>
              <span aria-current="page" className="text-white/60">
                Create agent
              </span>
            </nav>
          }
          actions={
            <div className="flex items-center gap-2">
              {cancelHref ? (
                <NamespacedLink href={cancelHref}>
                  <Button variant="outline">Cancel</Button>
                </NamespacedLink>
              ) : (
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={saving || hasUnavailableTools || readOnlyMode}>
                {saving && <Spinner className="mr-2 h-4 w-4" />}
                Create
              </Button>
            </div>
          }
        />
        <div className="flex-none px-12 pt-6 pb-3">
          <h1 className="text-fg-primary text-xl leading-7">
            New agent configuration
          </h1>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 items-start gap-20 overflow-auto px-12 pb-2">
          {/* Left column — form fields (576px) */}
          <div className="flex w-[576px] flex-col gap-6">
            {/* Name + warning */}
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        placeholder="e.g., customer-support-agent"
                        disabled={isDisabled}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div
                role="alert"
                className="bg-fill-onsurface-ui-3 flex items-center gap-3 px-3 py-3.5">
                <span className="text-status-warning shrink-0">
                  <CircleAlert className="size-4" />
                </span>
                <p className="text-fg-secondary flex-1 text-sm leading-4 tracking-[-0.112px]">
                  Agent names cannot be changed after creation.
                </p>
              </div>
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      variant="inline"
                      placeholder="e.g., Handles customer inquiries and support tickets"
                      disabled={isDisabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Model — inline combobox per figma 1436:50212 */}
            <FormField
              control={form.control}
              name="selectedModelName"
              render={({ field }) => {
                const modelItems = [
                  { value: '__none__', label: 'None (Unset)' },
                  ...models.map(m => ({ value: m.name, label: m.name })),
                ];
                return (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <Select
                      items={modelItems}
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isDisabled}>
                      <FormControl>
                        <SelectTrigger className="w-full rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40 focus-visible:border-b-stroke-status-focus">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-fill-onsurface-ui-2">
                        {modelItems.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            <SelectItemText>{item.label}</SelectItemText>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Tools — inline combobox per figma 1436:50125 */}
            <div className="flex flex-col gap-2">
              <FormLabel htmlFor="tools-trigger">Tools</FormLabel>
              <Popover
                open={toolsPopoverOpen}
                onOpenChange={setToolsPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    id="tools-trigger"
                    type="button"
                    disabled={isDisabled || toolsLoading}
                    className="flex w-full items-center justify-between border-0 border-b border-white/[0.24] bg-transparent px-0 py-1 text-left transition-colors hover:border-b-white/40 focus-visible:border-b-stroke-status-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                    <span
                      className={cn(
                        'text-sm leading-4 tracking-[-0.112px]',
                        selectedToolCount > 0
                          ? 'text-fg-primary'
                          : 'text-fg-tertiary',
                      )}>
                      {toolsTriggerLabel}
                    </span>
                    <ChevronDown
                      className={cn(
                        'text-fg-secondary size-4 transition-transform',
                        toolsPopoverOpen && 'rotate-180',
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={4}
                  className="bg-fill-onsurface-ui-2 shadow-elevation-1 max-h-[320px] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-none border-0 p-0 py-1">
                  {availableTools.length === 0 ? (
                    <p className="text-fg-secondary px-3 py-2 text-sm">
                      No tools available in this namespace.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2 py-1">
                      {availableTools.map(tool => {
                        const checked = isToolSelected(tool.name);
                        return (
                          <li key={tool.name}>
                            <label className="hover:bg-stateslayer-overlay-hover flex cursor-pointer items-center gap-3 px-3 py-1">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={value =>
                                  handleToolToggle(tool, value === true)
                                }
                                disabled={isDisabled}
                              />
                              <span className="text-fg-primary text-sm leading-4 tracking-[-0.112px]">
                                {tool.name}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Prompt — figma 1063:53424 (empty: 1065:55086) */}
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 text-sm tracking-[-0.112px]">
                    Prompt
                    <Info className="size-4" />
                  </FormLabel>
                  <FormControl>
                    <PromptEditor
                      variant="compact"
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Hint the agent objective here..."
                      disabled={isDisabled}
                      parameters={parameters}
                      className="min-h-[248px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Right column — Parameters panel (figma 1065:55508) */}
          <div className="bg-surface-secondary flex min-w-0 flex-1 flex-col p-5">
            <ParameterEditor
              variant="compact"
              parameters={parameters}
              onChange={setParameters}
              prompt={promptValue}
              disabled={isDisabled}
            />
          </div>
        </form>
      </Form>
    </div>
  );
}
