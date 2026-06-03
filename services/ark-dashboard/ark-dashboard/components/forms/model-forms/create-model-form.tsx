'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TrackedButton } from '@/components/ui/tracked-button';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useCreateModel } from '@/lib/services/models-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

import { ModelConfiguratorForm } from './model-configuration-form';
import { ModelConfigurationFormContext } from './model-configuration-form-context';
import type { FormValues } from './schema';
import { schema } from './schema';
import { createConfig, getResetValues } from './utils';

const formId = 'create-model-form';

type CreateModelFormProps = {
  defaultName?: string;
};

export function CreateModelForm({ defaultName }: CreateModelFormProps) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode, namespace } = useNamespace();
  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultName || '',
      provider: 'openai',
      model: '',
      secret: '',
      baseUrl: '',
    },
  });

  const provider = form.watch('provider');

  const handleSuccess = useCallback(() => {
    push('/models');
  }, [push]);

  const { mutate, isPending } = useCreateModel({
    onSuccess: handleSuccess,
  });

  useEffect(() => {
    const currentValues = form.getValues();
    form.reset(getResetValues(currentValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const onSubmit = (formValues: FormValues) => {
    const config = createConfig(formValues);
    mutate({
      name: formValues.name,
      provider: formValues.provider,
      model: formValues.model,
      config,
    });
  };

  return (
    <ModelConfigurationFormContext.Provider
      value={{
        formId,
        form,
        provider,
        onSubmit,
        isSubmitPending: isPending,
      }}>
      <div className="absolute inset-0 flex flex-col gap-5 overflow-hidden px-12 pt-10">
        <header className="flex flex-none flex-col gap-4">
          <div className="flex items-center justify-between">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
              <ChevronLeft className="size-4 text-white/30" />
              <NamespacedLink
                href="/models"
                className="text-white/30 transition-colors hover:text-white/60">
                Models
              </NamespacedLink>
              <span aria-hidden="true" className="text-white/60">
                /
              </span>
              <span aria-current="page" className="text-white/60">
                New model
              </span>
            </nav>
            <div className="flex items-center gap-2">
              <NamespacedLink href="/models">
                <Button variant="outline">Cancel</Button>
              </NamespacedLink>
              <TrackedButton
                type="submit"
                form={formId}
                disabled={isPending || readOnlyMode}
                trackingEvent="create_model_clicked"
                trackingProperties={{ modelType: provider }}>
                {isPending && <Spinner className="mr-2 h-4 w-4" />}
                {isPending ? 'Creating Model...' : 'Create Model'}
              </TrackedButton>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-fg-primary text-xl leading-7">Add New Model</h1>
            <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
              Fill in the information for the new model.
            </p>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 overflow-auto pb-2 pl-px">
          <div className="flex w-[576px] flex-col">
            <ModelConfiguratorForm />
          </div>
        </div>
      </div>
    </ModelConfigurationFormContext.Provider>
  );
}
