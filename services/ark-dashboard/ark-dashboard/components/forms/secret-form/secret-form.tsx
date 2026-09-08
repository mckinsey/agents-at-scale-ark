'use client';

import { useId } from 'react';

import { FormField } from '@/components/ui/form';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AliasField } from '../fields/alias-field';
import { FormLabelsField } from '../fields/labels-field';
import { FormTextField } from '../fields/text-field';
import { ResourceFormShell } from '../resource-form-shell';
import { type SecretFormProps } from './types';
import { useSecretForm } from './use-secret-form';

const SKELETON_FIELDS = ['name', 'description', 'alias', 'password'];

export function SecretForm({
  mode,
  secretName,
  onSuccess,
}: Readonly<SecretFormProps>) {
  const { readOnlyMode } = useNamespace();
  const nameFieldId = useId();
  const passwordFieldId = useId();
  const { form, isEdit, loading, saving, onSubmit, aliasOptions } =
    useSecretForm({
      mode,
      secretName,
      onSuccess,
    });

  const isDisabled = saving || loading || readOnlyMode;

  return (
    <ResourceFormShell
      form={form}
      backHref="/secrets"
      backLabel="Secrets"
      heading={isEdit ? 'Edit secret' : 'New secret'}
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
        placeholder="e.g., api-key-production"
        description="Secret names cannot be changed after creation"
        required
        disabled={isDisabled || isEdit}
      />

      <FormTextField
        control={form.control}
        name="description"
        label="Description"
        placeholder="e.g., API key used by the production models"
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
            placeholder="e.g., api-key"
            disabled={isDisabled}
            invalid={!!fieldState.error}
            error={fieldState.error?.message}
          />
        )}
      />

      <FormTextField
        control={form.control}
        name="password"
        id={passwordFieldId}
        label="Value"
        type="password"
        autoComplete="new-password"
        placeholder="Enter the secret value"
        required={!isEdit}
        disabled={isDisabled}
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
