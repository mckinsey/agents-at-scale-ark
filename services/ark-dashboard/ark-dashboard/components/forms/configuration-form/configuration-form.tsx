'use client';

import { useId } from 'react';

import { AliasField } from '@/components/forms/fields/alias-field';
import { LabelsField } from '@/components/forms/fields/labels-field';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useNamespace } from '@/providers/NamespaceProvider';

import { ConfigurationFormMode, type ConfigurationFormProps } from './types';
import { useConfigurationForm } from './use-configuration-form';

const VALUE_PLACEHOLDER = 'e.g., https://mcp.example.com';

export function ConfigurationForm({
  mode,
  configurationName,
  onSuccess,
  onCancel,
}: ConfigurationFormProps) {
  const { readOnlyMode } = useNamespace();
  const { form, state, actions } = useConfigurationForm({
    mode,
    configurationName,
    onSuccess,
  });

  const valueId = useId();
  const valueLabelId = useId();
  const valueHintId = useId();
  const valueErrorId = useId();

  const { loading, saving, aliasOptions } = state;
  const isEdit = mode === ConfigurationFormMode.EDIT;
  const isDisabled = saving || readOnlyMode;

  return (
    <ResourceFormShell
      form={form}
      breadcrumbLabel="Configurations"
      breadcrumbHref="/configurations"
      currentLabel={isEdit ? 'Edit configuration' : 'Create configuration'}
      title={isEdit ? 'Edit configuration' : 'New configuration'}
      submitLabel={isEdit ? 'Save' : 'Create'}
      onSubmit={actions.onSubmit}
      saving={saving}
      submitDisabled={readOnlyMode || loading}
      onCancel={onCancel}>
      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
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
                  placeholder="e.g., mcp-server-url"
                  disabled={isDisabled || isEdit}
                  aria-invalid={!!fieldState.error}
                  {...field}
                />
                <FieldDescription>
                  Configuration names cannot be changed after creation
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
                  placeholder="e.g., Base URL of the MCP server for this environment"
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
              <AliasField
                value={field.value}
                onChange={field.onChange}
                options={aliasOptions}
                disabled={isDisabled}
                error={fieldState.error?.message}
              />
            )}
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
                  id={valueId}
                  placeholder={VALUE_PLACEHOLDER}
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

          <FormField
            control={form.control}
            name="labels"
            render={({ field, fieldState }) => (
              <LabelsField
                value={field.value}
                onChange={field.onChange}
                disabled={isDisabled}
                error={fieldState.error?.message}
              />
            )}
          />
        </>
      )}
    </ResourceFormShell>
  );
}
