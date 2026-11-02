'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  useCreateSecret,
  useGetAllSecrets,
  useGetSecret,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';
import { useUser } from '@/providers/UserProvider';

import { useAliasOptions } from '../fields/use-alias-options';
import {
  SecretFormMode,
  createSecretFormSchema,
  type SecretFormProps,
  type SecretFormValues,
} from './types';

const EMPTY_VALUES: SecretFormValues = {
  name: '',
  password: '',
  description: '',
  alias: '',
  labels: [],
  labelDraft: '',
  scope: 'shared',
};

export function useSecretForm({
  mode,
  secretName,
  onSuccess,
}: Readonly<SecretFormProps>) {
  const isEdit = mode === SecretFormMode.EDIT;
  const { user } = useUser();

  const existingLabelsRef = useRef<readonly string[]>([]);

  const form = useForm<SecretFormValues>({
    resolver: zodResolver(
      createSecretFormSchema(mode, () => existingLabelsRef.current),
    ),
    mode: 'onTouched',
    defaultValues: EMPTY_VALUES,
  });

  const { data: secret, isLoading } = useGetSecret(
    isEdit ? secretName : undefined,
  );

  const { data: allSecrets } = useGetAllSecrets();
  const aliasOptions = useAliasOptions(allSecrets, secretName);

  const { reset } = form;
  useEffect(() => {
    if (!secret) {
      return;
    }
    existingLabelsRef.current = secret.labels;
    reset({
      name: secret.name,
      password: '',
      description: secret.description ?? '',
      alias: secret.alias ?? '',
      labels: secret.labels,
      labelDraft: '',
      scope: secret.scope,
    });
  }, [secret, reset]);

  const createSecret = useCreateSecret({ onSuccess });
  const updateSecret = useUpdateSecret({ onSuccess });
  const promoteSecret = useUpdateSecret({
    successMessage: 'Secret is now shared',
  });

  const makeShared = (): void => {
    if (!secret || !secretName) {
      return;
    }
    promoteSecret.mutate({
      name: secretName,
      request: {
        description: secret.description ?? null,
        alias: secret.alias ?? null,
        labels: secret.labels,
        scope: 'shared',
      },
    });
  };

  const onSubmit = async (values: SecretFormValues): Promise<void> => {
    const description = values.description || null;
    const alias = values.alias || null;

    if (isEdit && secretName) {
      await updateSecret.mutateAsync({
        name: secretName,
        request: {
          string_data: values.password ? { token: values.password } : undefined,
          description,
          alias,
          labels: values.labels,
        },
      });
      return;
    }

    await createSecret.mutateAsync({
      name: values.name,
      string_data: { token: values.password },
      type: 'Opaque',
      description,
      alias,
      labels: values.labels,
      scope: user ? values.scope : 'shared',
    });
  };

  return {
    form,
    isEdit,
    loading: isEdit && isLoading,
    saving:
      createSecret.isPending ||
      updateSecret.isPending ||
      promoteSecret.isPending,
    onSubmit,
    aliasOptions,
    secret,
    canChooseScope: !isEdit && Boolean(user),
    makeShared,
    makingShared: promoteSecret.isPending,
    hasUnsavedChanges: form.formState.isDirty,
  };
}
