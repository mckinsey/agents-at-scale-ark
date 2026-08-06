'use client';

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
import { useNamespace } from '@/providers/NamespaceProvider';

import { SecretFormMode, type SecretFormProps } from './types';
import { useSecretForm } from './use-secret-form';

export function SecretForm({
  mode,
  secretName,
  onSuccess,
  onCancel,
}: SecretFormProps) {
  const { readOnlyMode } = useNamespace();
  const { form, state, actions } = useSecretForm({
    mode,
    secretName,
    onSuccess,
  });

  const { loading, saving, aliasOptions } = state;
  const isEdit = mode === SecretFormMode.EDIT;
  const isDisabled = saving || readOnlyMode;

  return (
    <ResourceFormShell
      form={form}
      breadcrumbLabel="Secrets"
      breadcrumbHref="/secrets"
      currentLabel={isEdit ? 'Edit secret' : 'Create secret'}
      title={isEdit ? 'Edit secret' : 'New secret'}
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
                  placeholder="e.g., api-key-production"
                  disabled={isDisabled || isEdit}
                  aria-invalid={!!fieldState.error}
                  {...field}
                />
                <FieldDescription>
                  Secret names cannot be changed after creation
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
                  placeholder="e.g., API key used by the production models"
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
                placeholder="e.g., api-key"
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
                <FieldTitle>
                  Value <RequiredMarker />
                </FieldTitle>
                <Input
                  variant="inline"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter the secret value"
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
