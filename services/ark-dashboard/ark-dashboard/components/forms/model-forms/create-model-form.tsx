'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Spinner } from '@/components/ui/spinner';
import { TrackedButton } from '@/components/ui/tracked-button';
import { useCreateModel } from '@/lib/services/models-hooks';

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
  const router = useRouter();
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
    router.push('/models');
  }, [router]);

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
      <div className="shrink-0 space-y-4 md:w-md md:max-w-md">
        <section>
          <div className="text-lg leading-none font-semibold">
            Add New Model
          </div>
          <span className="text-muted-foreground text-sm text-pretty">
            Fill in the information for the new model.
          </span>
        </section>
        <section>
          <ModelConfiguratorForm />
          <TrackedButton
            type="submit"
            form={formId}
            disabled={isPending}
            className="mt-8 w-full"
            trackingEvent="create_model_clicked"
            trackingProperties={{ modelType: provider }}>
            {isPending ? (
              <>
                <Spinner size="sm" />
                <span>Creating Model...</span>
              </>
            ) : (
              <span>Create Model</span>
            )}
          </TrackedButton>
        </section>
      </div>
    </ModelConfigurationFormContext.Provider>
  );
}
