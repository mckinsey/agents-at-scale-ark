'use client';

import { useId } from 'react';

import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AliasField } from '../fields/alias-field';
import { LabelsField } from '../fields/labels-field';
import { RequiredMarker, ResourceFormShell } from '../resource-form-shell';
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
              placeholder="e.g., api-key-production"
              disabled={isDisabled || isEdit}
              aria-invalid={!!fieldState.error}
              aria-describedby={`${nameFieldId}-description`}
              {...field}
            />
            <FieldDescription id={`${nameFieldId}-description`}>
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
            onBlur={field.onBlur}
            options={aliasOptions}
            placeholder="e.g., api-key"
            disabled={isDisabled}
            invalid={!!fieldState.error}
            error={fieldState.error?.message}
          />
        )}
      />

      <FormField
        control={form.control}
        name="password"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Value {!isEdit && <RequiredMarker />}</FieldTitle>
            <Input
              id={passwordFieldId}
              type="password"
              variant="inline"
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
