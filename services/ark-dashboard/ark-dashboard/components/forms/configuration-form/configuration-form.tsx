'use client';

import { useId } from 'react';

import { Info } from '@/components/icons';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNamespace } from '@/providers/NamespaceProvider';

import { LabelsField } from '../fields/labels-field';
import { RequiredMarker, ResourceFormShell } from '../resource-form-shell';
import { type ConfigurationFormProps } from './types';
import { useConfigurationForm } from './use-configuration-form';

const SKELETON_FIELDS = ['name', 'value', 'description', 'alias'];

export function ConfigurationForm({
  mode,
  configurationName,
  onSuccess,
}: Readonly<ConfigurationFormProps>) {
  const { readOnlyMode } = useNamespace();
  const nameFieldId = useId();
  const valueFieldId = useId();
  const { form, isEdit, loading, saving, onSubmit } = useConfigurationForm({
    mode,
    configurationName,
    onSuccess,
  });

  const isDisabled = saving || loading || readOnlyMode;

  return (
    <ResourceFormShell
      form={form}
      backHref="/configurations"
      backLabel="Configurations"
      heading={isEdit ? 'Edit configuration' : 'New configuration'}
      submitLabel={isEdit ? 'Save' : 'Create'}
      onSubmit={onSubmit}
      loading={loading}
      saving={saving}
      submitDisabled={loading || readOnlyMode}
      skeletonFields={SKELETON_FIELDS}>
      <FormField
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>
              Name <RequiredMarker />
            </FieldTitle>
            <Input
              id={nameFieldId}
              variant="inline"
              placeholder="e.g., github-mcp-url"
              disabled={isDisabled || isEdit}
              aria-invalid={!!fieldState.error}
              aria-describedby={`${nameFieldId}-description`}
              {...field}
            />
            <FieldDescription id={`${nameFieldId}-description`}>
              Resources reference the configuration by this name. It cannot
              be changed after creation.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />

      <FormField
        control={form.control}
        name="value"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>
              Value <RequiredMarker />
            </FieldTitle>
            <Textarea
              id={valueFieldId}
              rows={4}
              placeholder="e.g., https://api.githubcopilot.com/mcp/"
              disabled={isDisabled}
              aria-invalid={!!fieldState.error}
              aria-describedby={`${valueFieldId}-description`}
              {...field}
            />
            <FieldDescription id={`${valueFieldId}-description`}>
              Stored in plain text. Use a Secret for anything sensitive.
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
              placeholder="e.g., GitHub remote MCP endpoint"
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
        name="alias"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle className="flex items-center gap-1.5">
              Alias
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="What is an alias?"
                    className="text-fg-secondary hover:text-fg-primary">
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  A shorter label shown alongside the name in lists. Display
                  only — resources still reference the configuration by its
                  name.
                </TooltipContent>
              </Tooltip>
            </FieldTitle>
            <Input
              variant="inline"
              placeholder="e.g., github-mcp"
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
        name="labels"
        render={({ field }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Labels</FieldTitle>
            <FormField
              control={form.control}
              name="labelDraft"
              render={({ field: draftField, fieldState }) => (
                <LabelsField
                  value={field.value}
                  onChange={field.onChange}
                  draft={draftField.value}
                  onDraftChange={draftField.onChange}
                  onDraftTouched={draftField.onBlur}
                  error={fieldState.error?.message}
                  disabled={isDisabled}
                />
              )}
            />
          </FieldSet>
        )}
      />
    </ResourceFormShell>
  );
}
