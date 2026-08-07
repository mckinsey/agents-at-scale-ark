'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  useCreateConfiguration,
  useGetConfiguration,
  useUpdateConfiguration,
} from '@/lib/services/configurations-hooks';

import {
  ConfigurationFormMode,
  configurationFormSchema,
  type ConfigurationFormProps,
  type ConfigurationFormValues,
} from './types';

const EMPTY_VALUES: ConfigurationFormValues = {
  name: '',
  value: '',
  description: '',
  alias: '',
  tags: [],
};

export function useConfigurationForm({
  mode,
  configurationName,
  onSuccess,
}: Readonly<ConfigurationFormProps>) {
  const isEdit = mode === ConfigurationFormMode.EDIT;

  const form = useForm<ConfigurationFormValues>({
    resolver: zodResolver(configurationFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY_VALUES,
  });

  const { data: configuration, isLoading } = useGetConfiguration(
    isEdit ? configurationName : undefined,
  );

  const { reset } = form;
  useEffect(() => {
    if (!configuration) {
      return;
    }
    reset({
      name: configuration.name,
      value: configuration.value ?? '',
      description: configuration.description ?? '',
      alias: configuration.alias ?? '',
      tags: configuration.tags,
    });
  }, [configuration, reset]);

  const createConfiguration = useCreateConfiguration({ onSuccess });
  const updateConfiguration = useUpdateConfiguration({ onSuccess });

  const onSubmit = async (values: ConfigurationFormValues): Promise<void> => {
    const payload = {
      value: values.value,
      description: values.description || null,
      alias: values.alias || null,
      tags: values.tags,
    };

    if (isEdit && configurationName) {
      await updateConfiguration.mutateAsync({
        name: configurationName,
        request: payload,
      });
      return;
    }

    await createConfiguration.mutateAsync({ name: values.name, ...payload });
  };

  return {
    form,
    isEdit,
    loading: isEdit && isLoading,
    saving: createConfiguration.isPending || updateConfiguration.isPending,
    onSubmit,
  };
}
