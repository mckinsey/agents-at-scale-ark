'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TrackedButton } from '@/components/ui/tracked-button';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { Model } from '@/lib/services';
import { useUpdateModelById } from '@/lib/services/models-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

import { ModelConfiguratorForm } from './model-configuration-form';
import type { DisabledFields } from './model-configuration-form-context';
import { ModelConfigurationFormContext } from './model-configuration-form-context';
import type { FormValues } from './schema';
import { schema } from './schema';
import { createModelUpdateConfig, getDefaultValuesForUpdate } from './utils';

const formId = 'model-update-form';

const disabledFields: DisabledFields = {
  name: true,
  provider: true,
};

type UpdateModelFormProps = {
  model: Model;
};

export function UpdateModelForm({ model }: UpdateModelFormProps) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode, namespace } = useNamespace();

  const defaultValues = getDefaultValuesForUpdate(model);
  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleSuccess = useCallback(() => {
    push('/models');
  }, [push]);

  const { mutateAsync, isPending } = useUpdateModelById();

  const onSubmit = (formValues: FormValues) => {
    const config = createModelUpdateConfig(formValues);
    mutateAsync({
      id: model.id,
      model: formValues.model,
      config,
    }).then(handleSuccess);
  };

  return (
    <ModelConfigurationFormContext.Provider
      value={{
        form,
        onSubmit,
        isSubmitPending: isPending,
        provider: defaultValues.provider,
        disabledFields,
        formId,
        initialAzureAuthMethod:
          defaultValues.provider === 'azure'
            ? defaultValues.azureAuthMethod
            : undefined,
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
                {model.id}
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
                trackingEvent="update_model_clicked"
                trackingProperties={{ modelId: model.id }}>
                {isPending && <Spinner className="mr-2 h-4 w-4" />}
                {isPending ? 'Updating Model...' : 'Update Model'}
              </TrackedButton>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-fg-primary text-xl leading-7">
              Update Model: {model.id}
            </h1>
            <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
              Update the information for the model.
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
