'use client';

import { useId } from 'react';

import { FieldDescription, FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useNamespace } from '@/providers/NamespaceProvider';

import { FormAliasField } from '../fields/alias-field';
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
  const valueLabelId = useId();
  const valueHintId = useId();
  const valueErrorId = useId();
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
      breadcrumbCurrent={isEdit ? 'Edit configuration' : 'Create configuration'}
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
        placeholder="e.g., mcp-server-url"
        description="Configuration names cannot be changed after creation"
        required
        disabled={isDisabled || isEdit}
      />

      <FormTextField
        control={form.control}
        name="description"
        label="Description"
        placeholder="e.g., Base URL of the MCP server for this environment"
        disabled={isDisabled}
      />

      <FormAliasField
        control={form.control}
        name="alias"
        options={aliasOptions}
        disabled={isDisabled}
      />

      <FormField
        control={form.control}
        name="value"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle id={valueLabelId}>
              Value <RequiredMarker />
            </FieldTitle>
            <Textarea
              id={valueFieldId}
              placeholder="e.g., https://mcp.example.com"
              disabled={isDisabled}
              aria-labelledby={valueLabelId}
              aria-required="true"
              aria-invalid={!!fieldState.error}
              aria-describedby={
                fieldState.error
                  ? `${valueHintId} ${valueErrorId}`
                  : valueHintId
              }
              className="focus-visible:bg-fill-onsurface-ui-3 max-h-[480px] min-h-[160px] resize-y overflow-auto font-mono"
              {...field}
            />
            <FieldDescription id={valueHintId}>
              Supports multiple lines — YAML, JSON or plain text.
            </FieldDescription>
            <FieldError id={valueErrorId}>
              {fieldState.error?.message}
            </FieldError>
          </FieldSet>
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
