'use client';

import { useState } from 'react';

import { ChevronDown, ChevronLeft } from '@/components/icons';
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
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

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

  const { setParameters, handleToolToggle, isToolSelected, onSubmit } = actions;

  const promptValue = form.watch('prompt') || '';
  const isDisabled = form.formState.isSubmitting;
  const hasUnavailableTools = unavailableTools.length > 0;
  const cancelHref = onCancel ? undefined : '/agents';

  const [toolsPopoverOpen, setToolsPopoverOpen] = useState(false);
  const selectedTools = availableTools.filter(t => isToolSelected(t.name));
  const selectedToolCount = selectedTools.length;
  const MAX_VISIBLE_TAGS = 4;
  const visibleSelectedTools = selectedTools.slice(0, MAX_VISIBLE_TAGS);
  const overflowSelectedCount = selectedToolCount - visibleSelectedTools.length;
  const placeholderLabel = toolsLoading ? 'Loading tools...' : 'Select tools';
  const toolsTriggerDisabled = isDisabled || toolsLoading;

  return (
    <div className="absolute inset-0 flex flex-col gap-5 overflow-hidden px-12 pt-10">
      {/* Header — figma 4254:21323 (80px tall, 16px gap between rows) */}
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <ChevronLeft className="size-4 text-white/30" />
            <NamespacedLink
              href="/agents"
              className="text-white/30 transition-colors hover:text-white/60">
              Agents
            </NamespacedLink>
            <span aria-hidden="true" className="text-white/60">
              /
            </span>
            <span aria-current="page" className="text-white/60">
              Create agent
            </span>
          </nav>
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
        </div>
        <h1 className="text-fg-primary text-xl leading-7">
          New agent configuration
        </h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 items-start gap-20 overflow-auto pb-2 pl-px">
          {/* Left column — form fields (576px) */}
          <div className="flex w-[576px] flex-col gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Name <RequiredMarker />
                  </FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="e.g., customer-support-agent"
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldDescription>
                    Agent names cannot be changed after creation
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

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

            <FormField
              control={form.control}
              name="selectedModelName"
              render={({ field, fieldState }) => {
                const modelItems = [
                  { value: '__none__', label: 'None (Unset)' },
                  ...models.map(m => ({ value: m.name, label: m.name })),
                ];
                return (
                  <FieldSet className="gap-2">
                    <FieldTitle>Model</FieldTitle>
                    <Select
                      items={modelItems}
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isDisabled}>
                      <SelectTrigger className="w-full rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40 focus-visible:border-b-stroke-status-focus">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent className="bg-fill-onsurface-ui-2">
                        {modelItems.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            <SelectItemText>{item.label}</SelectItemText>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldSet>
                );
              }}
            />

            <FieldSet className="gap-2">
              <FieldTitle>Tools</FieldTitle>
              <Popover
                open={toolsPopoverOpen}
                onOpenChange={setToolsPopoverOpen}>
                <PopoverTrigger asChild>
                  <div
                    id="tools-trigger"
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
                      'flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-white/[0.24] bg-transparent px-0 py-1 text-left transition-colors',
                      'hover:border-b-white/40 focus-visible:border-b-stroke-status-focus focus-visible:outline-none',
                      'aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                    )}>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      {selectedToolCount === 0 ? (
                        <span className="text-fg-tertiary text-sm leading-5 tracking-[-0.028px]">
                          {placeholderLabel}
                        </span>
                      ) : (
                        <>
                          {visibleSelectedTools.map(tool => (
                            <Tag
                              key={tool.name}
                              size="xs"
                              variant="primary"
                              onPointerDown={e => e.stopPropagation()}
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
                    <ChevronDown
                      className={cn(
                        'text-fg-secondary size-4 shrink-0 transition-transform',
                        toolsPopoverOpen && 'rotate-180',
                      )}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={4}
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
                          <li key={tool.name} role="option" aria-selected={checked}>
                            <label
                              className={cn(
                                'flex h-9 cursor-pointer items-center gap-2 px-1',
                                'hover:bg-stateslayer-overlay-hover',
                              )}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={value =>
                                  handleToolToggle(tool, value === true)
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
                                  <TooltipContent side="bottom" align="start">
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
            </FieldSet>

            <FormField
              control={form.control}
              name="prompt"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Prompt <RequiredMarker />
                  </FieldTitle>
                  <Textarea
                    placeholder="Hint the agent objective here..."
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    className="min-h-[248px] resize-none"
                    {...field}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />
          </div>

          {/* Right column — Variables panel (figma 4257:26496, 464px fixed) */}
          <div className="bg-surface-primary flex w-[464px] flex-none flex-col p-5">
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
