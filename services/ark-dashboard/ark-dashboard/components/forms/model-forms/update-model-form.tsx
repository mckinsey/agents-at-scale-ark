'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { Spinner } from '@/components/ui/spinner';
import { TrackedButton } from '@/components/ui/tracked-button';
import type { Model } from '@/lib/services';
import { useUpdateModelById } from '@/lib/services/models-hooks';

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
  const router = useRouter();

  const defaultValues = getDefaultValuesForUpdate(model);
  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleSuccess = useCallback(() => {
    router.push('/models');
  }, [router]);

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
      }}>
      <div className="shrink-0 space-y-4 md:w-md md:max-w-md">
        <section>
          <div className="text-lg leading-none font-semibold">
            Update Model: {model.id}
          </div>
          <span className="text-muted-foreground text-sm text-pretty">
            Update the information for the model.
          </span>
        </section>
        <section>
          <ModelConfiguratorForm />
          <TrackedButton
            type="submit"
            form={formId}
            disabled={isPending}
            className="mt-8 w-full"
            trackingEvent="update_model_clicked"
            trackingProperties={{ modelId: model.id }}>
            {isPending ? (
              <>
                <Spinner size="sm" />
                <span>Updating Model...</span>
              </>
            ) : (
              <span>Update Model</span>
            )}
          </TrackedButton>
        </section>
      </div>
    </ModelConfigurationFormContext.Provider>
  );
}
