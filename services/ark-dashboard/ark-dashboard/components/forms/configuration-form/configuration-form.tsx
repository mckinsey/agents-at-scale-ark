'use client';

import { useId } from 'react';

import { FieldDescription, FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AliasField } from '../fields/alias-field';
import { FormLabelsField } from '../fields/labels-field';
import { FormTextField } from '../fields/text-field';
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
  const { form, isEdit, loading, saving, onSubmit, aliasOptions } =
    useConfigurationForm({
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
      <FormTextField
        control={form.control}
        name="name"
        id={nameFieldId}
        label="Name"
        placeholder="e.g., github-mcp-url"
        description="Resources reference the configuration by this name. It cannot be changed after creation."
        required
        disabled={isDisabled || isEdit}
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

      <FormTextField
        control={form.control}
        name="description"
        label="Description"
        placeholder="e.g., GitHub remote MCP endpoint"
        disabled={isDisabled}
      />

      <FormField
        control={form.control}
        name="alias"
        render={({ field, fieldState }) => (
          <AliasField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            options={aliasOptions}
            placeholder="e.g., github-mcp"
            disabled={isDisabled}
            invalid={!!fieldState.error}
            error={fieldState.error?.message}
          />
        )}
      />

      <FormLabelsField
        control={form.control}
        labelsName="labels"
        labelDraftName="labelDraft"
        disabled={isDisabled}
      />
    </ResourceFormShell>
  );
}
