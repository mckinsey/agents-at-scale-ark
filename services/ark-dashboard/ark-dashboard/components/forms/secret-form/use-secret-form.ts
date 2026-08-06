'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  useCreateSecret,
  useGetAllSecrets,
  useGetSecret,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';

import {
  SecretFormMode,
  type SecretFormValues,
  secretFormSchema,
} from './types';

interface UseSecretFormOptions {
  mode: SecretFormMode;
  secretName?: string;
  onSuccess?: () => void;
}

const EMPTY_VALUES: SecretFormValues = {
  name: '',
  description: '',
  alias: '',
  value: '',
  labels: [],
};

export function useSecretForm({
  mode,
  secretName,
  onSuccess,
}: UseSecretFormOptions) {
  const isEdit = mode === SecretFormMode.EDIT;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const form = useForm<SecretFormValues>({
    resolver: zodResolver(secretFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  const { data: secrets = [] } = useGetAllSecrets();
  const { data: secret, isLoading } = useGetSecret(
    isEdit ? secretName : undefined,
  );

  useEffect(() => {
    if (!isEdit || !secret) return;

    form.reset({
      name: secret.name,
      description: secret.description ?? '',
      alias: secret.alias ?? '',
      value: secret.value ?? '',
      labels: secret.labels ?? [],
    });
  }, [form, isEdit, secret]);

  const handleSuccess = useCallback(() => {
    onSuccessRef.current?.();
  }, []);

  const createSecret = useCreateSecret({ onSuccess: handleSuccess });
  const updateSecret = useUpdateSecret({ onSuccess: handleSuccess });

  const aliasOptions = useMemo(
    () =>
      secrets
        .map(item => item.name)
        .filter(name => name !== secretName)
        .sort((a, b) => a.localeCompare(b)),
    [secretName, secrets],
  );

  const onSubmit = useCallback(
    (values: SecretFormValues) => {
      const payload = {
        password: values.value,
        description: values.description || null,
        alias: values.alias || null,
        labels: values.labels,
      };

      if (isEdit && secretName) {
        updateSecret.mutate({ name: secretName, ...payload });
        return;
      }

      createSecret.mutate({ name: values.name, ...payload });
    },
    [createSecret, isEdit, secretName, updateSecret],
  );

  return {
    form,
    state: {
      mode,
      loading: isEdit && isLoading,
      saving: createSecret.isPending || updateSecret.isPending,
      aliasOptions,
    },
    actions: {
      onSubmit,
    },
  };
}
