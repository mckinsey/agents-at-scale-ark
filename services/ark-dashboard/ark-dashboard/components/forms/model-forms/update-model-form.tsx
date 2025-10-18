"use client";

import { DisabledFields, ModelConfigurationFormContext } from "./model-configuration-form-context";

import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from '@hookform/resolvers/zod';
import { useUpdateModelById } from "@/lib/services/models-hooks";
import { useRouter } from "next/navigation";
import { FormValues, schema } from "./schema";
import { Model } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ModelConfiguratorForm } from "./model-configuration-form";
import { createModelUpdateConfig, getDefaultValuesForUpdate } from "./utils";

const formId = "model-update-form"

const disabledFields: DisabledFields = {
  name: true,
  type: true
}

type UpdateModelFormProps = {
  model: Model
}

export function UpdateModelForm({ model }: UpdateModelFormProps) {
  const router = useRouter()

  const defaultValues = getDefaultValuesForUpdate(model)
  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues
  })

  const handleSuccess = useCallback(() => {
    router.push("/models")
  }, [router])

  const { mutateAsync, isPending } = useUpdateModelById()

  const onSubmit = (formValues: FormValues) => {
    const config = createModelUpdateConfig(formValues)
    mutateAsync({
      id: model.id,
      model: formValues.model,
      config
    }).then(handleSuccess)
  }

  return (
    <ModelConfigurationFormContext.Provider value={{
      form,
      onSubmit,
      isSubmitPending: isPending,
      type: defaultValues.type,
      disabledFields,
      formId
    }}>
      <div className="md:w-md md:max-w-md shrink-0 space-y-4">
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
          <Button
            type="submit"
            form={formId}
            disabled={isPending}
            className="w-full mt-8"
          >
            {
              isPending ? (<>
                <Spinner size="sm" />
                <span>Updating Model...</span>
              </>) : (<span>Update Model</span>)
            }
          </Button>
        </section>
      </div>
    </ModelConfigurationFormContext.Provider>
  );
}
