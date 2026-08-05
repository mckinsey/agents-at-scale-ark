'use client';

import {
  RequiredMarker,
  ResourceFormShell,
} from '@/components/forms/resource-form-shell';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
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
import { useNamespace } from '@/providers/NamespaceProvider';

import { PromptField } from './prompt-field';
import { ToolsMultiSelect } from './sections/tools-multi-select';
import { AgentFormMode, type AgentFormProps } from './types';
import { useAgentForm } from './use-agent-form';

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

  return (
    <ResourceFormShell
      form={form}
      breadcrumbLabel="Agents"
      breadcrumbHref="/agents"
      currentLabel="Create agent"
      title="New agent configuration"
      submitLabel="Create"
      onSubmit={onSubmit}
      saving={saving}
      submitDisabled={hasUnavailableTools || readOnlyMode}
      onCancel={onCancel}
      sidePanel={
        <ParameterEditor
          parameters={parameters}
          onChange={setParameters}
          prompt={promptValue}
          disabled={isDisabled}
          compactRowsClassName="[&_[data-slot=scroll-area-viewport]]:max-h-[480px]"
        />
      }>
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
          <PromptField
            value={field.value || ''}
            onChange={field.onChange}
            error={fieldState.error?.message}
            hasError={!!fieldState.error}
            disabled={isDisabled}
            parameters={parameters}
            required
          />
        )}
      />
    </ResourceFormShell>
  );
}
