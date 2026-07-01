'use client';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ParameterEditor } from '@/components/ui/parameter-editor';
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

import { ToolsMultiSelect } from './sections/tools-multi-select';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export function CreateAgentForm({
  onSuccess,
  onCancel,
}: Readonly<AgentFormProps>) {
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

  return (
    <div className="flex min-h-0 w-full max-w-[1344px] flex-1 flex-col gap-5 overflow-hidden">
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
          className="flex min-h-0 flex-1 items-start gap-20 overflow-hidden pb-2 pl-px">
          {/* Left column — form fields (576px) */}
          <div className="flex max-h-full min-h-0 w-[576px] flex-col gap-6 overflow-y-auto">
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
                      <SelectTrigger className="focus-visible:border-b-stroke-status-focus w-full rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40">
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
              <ToolsMultiSelect
                availableTools={availableTools}
                isToolSelected={isToolSelected}
                onToggle={handleToolToggle}
                toolsLoading={toolsLoading}
                disabled={isDisabled}
              />
            </FieldSet>

            <FormField
              control={form.control}
              name="prompt"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Prompt <RequiredMarker />
                  </FieldTitle>
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
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />
          </div>

          {/* Right column — Variables panel (figma 4257:26496, 464px fixed) */}
          <div className="bg-surface-primary flex max-h-full min-h-0 w-[464px] flex-none flex-col overflow-y-auto p-5">
            <ParameterEditor
              parameters={parameters}
              onChange={setParameters}
              prompt={promptValue}
              disabled={isDisabled}
              compactRowsClassName="[&_[data-slot=scroll-area-viewport]]:max-h-[480px]"
            />
          </div>
        </form>
      </Form>
    </div>
  );
}
