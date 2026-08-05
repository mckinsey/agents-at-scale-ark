'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';

import {
  useCreateConfiguration,
  useGetAllConfigurations,
  useGetConfiguration,
  useUpdateConfiguration,
} from '@/lib/services/configurations-hooks';

import {
  ConfigurationFormMode,
  type ConfigurationFormValues,
  configurationFormSchema,
} from './types';

interface UseConfigurationFormOptions {
  mode: ConfigurationFormMode;
  configurationName?: string;
  onSuccess?: () => void;
}

const EMPTY_VALUES: ConfigurationFormValues = {
  name: '',
  description: '',
  alias: '',
  value: '',
  labels: [],
};

export function useConfigurationForm({
  mode,
  configurationName,
  onSuccess,
}: UseConfigurationFormOptions) {
  const isEdit = mode === ConfigurationFormMode.EDIT;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const form = useForm<ConfigurationFormValues>({
    resolver: zodResolver(configurationFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  const { data: configurations = [] } = useGetAllConfigurations();
  const { data: configuration, isLoading } = useGetConfiguration(
    isEdit ? configurationName : undefined,
  );

  useEffect(() => {
    if (!isEdit || !configuration) return;

    form.reset({
      name: configuration.name,
      description: configuration.description ?? '',
      alias: configuration.alias ?? '',
      value: configuration.value ?? '',
      labels: configuration.labels ?? [],
    });
  }, [configuration, form, isEdit]);

  const handleSuccess = useCallback(() => {
    onSuccessRef.current?.();
  }, []);

  const createConfiguration = useCreateConfiguration({
    onSuccess: handleSuccess,
  });
  const updateConfiguration = useUpdateConfiguration({
    onSuccess: handleSuccess,
  });

  const aliasOptions = useMemo(
    () =>
      configurations
        .map(item => item.name)
        .filter(name => name !== configurationName)
        .sort((a, b) => a.localeCompare(b)),
    [configurations, configurationName],
  );

  const onSubmit = useCallback(
    (values: ConfigurationFormValues) => {
      const payload = {
        value: values.value,
        description: values.description || null,
        alias: values.alias || null,
        labels: values.labels,
      };

      if (isEdit && configurationName) {
        updateConfiguration.mutate({
          name: configurationName,
          request: payload,
        });
        return;
      }

      createConfiguration.mutate({
        name: values.name,
        ...payload,
      });
    },
    [configurationName, createConfiguration, isEdit, updateConfiguration],
  );

  return {
    form,
    state: {
      mode,
      loading: isEdit && isLoading,
      saving: createConfiguration.isPending || updateConfiguration.isPending,
      aliasOptions,
    },
    actions: {
      onSubmit,
    },
  };
}
