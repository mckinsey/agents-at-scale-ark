'use client';

import { useId } from 'react';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useNamespace } from '@/providers/NamespaceProvider';

import { AliasField } from '../fields/alias-field';
import { LabelsField } from '../fields/labels-field';
import { type SecretFormProps } from './types';
import { useSecretForm } from './use-secret-form';

const SKELETON_FIELDS = ['name', 'password', 'description', 'alias'];

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

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
  const heading = isEdit ? 'Edit secret' : 'New secret';

  if (loading) {
    return (
      <div
        aria-hidden
        className="content-shell flex w-full flex-1 flex-col gap-6 pt-16">
        {SKELETON_FIELDS.map(field => (
          <div key={field} className="flex w-[576px] flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <DetailBreadcrumb
            backHref="/secrets"
            backLabel="Secrets"
            current={heading}
          />
          <div className="flex items-center gap-2">
            <NamespacedLink href="/secrets">
              <Button variant="outline">Cancel</Button>
            </NamespacedLink>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={isDisabled}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{heading}</h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden pb-2 pl-px">
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
                    id={nameFieldId}
                    variant="inline"
                    placeholder="e.g., api-key-production"
                    disabled={isDisabled || isEdit}
                    aria-invalid={!!fieldState.error}
                    aria-describedby={`${nameFieldId}-description`}
                    {...field}
                  />
                  <FieldDescription id={`${nameFieldId}-description`}>
                    Resources reference the secret by this name. It cannot be
                    changed after creation.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Value {!isEdit && <RequiredMarker />}
                  </FieldTitle>
                  <Input
                    id={passwordFieldId}
                    type="password"
                    variant="inline"
                    placeholder={
                      isEdit ? 'Leave blank to keep unchanged' : 'Enter the secret token'
                    }
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
              name="description"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>Description</FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="e.g., Production API key"
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
                  disabled={isDisabled}
                  invalid={!!fieldState.error}
                  error={fieldState.error?.message}
                />
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
          </div>
        </form>
      </Form>
    </div>
  );
}
