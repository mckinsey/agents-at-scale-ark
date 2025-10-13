"use client";

import { toast } from "@/components/ui/use-toast";
import { createContext, Dispatch, PropsWithChildren, SetStateAction, useCallback, useContext, useEffect, useState } from "react";
import { Control, useForm, UseFormReturn, UseFormSetValue } from "react-hook-form";
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod';
import { kubernetesNameSchema } from "@/lib/utils/kubernetes-validation";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateSecret, useGetAllSecrets } from "@/lib/services/secrets-hooks";
import { ModelCreateRequest, Secret } from "@/lib/services";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useCreateModel } from "@/lib/services/models-hooks";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import { SecretDetailResponse } from "@/lib/services/secrets";
import { KeysOfUnion } from "@/lib/types/utils";

const openaiSchema = z.object({
  name: kubernetesNameSchema,
  type: z.literal("openai"),
  model: z.string().min(1, { message: "Model is required" }),
  secret: z.string().min(1, { message: "Secret is required" }),
  baseUrl: z.string().min(1, { message: "Base URL is required" })
})

const azureSchema = z.object({
  name: kubernetesNameSchema,
  type: z.literal("azure"),
  model: z.string().min(1, { message: "Name is required" }),
  secret: z.string().min(1, { message: "Name is required" }),
  baseUrl: z.string().min(1, { message: "Name is required" }),
  azureApiVersion: z.string().nullish()
})

const bedrockSchema = z.object({
  name: kubernetesNameSchema,
  type: z.literal("bedrock"),
  model: z.string().min(1, { message: "Name is required" }),
  bedrockAccessKeyIdSecretName: z.string().min(1, { message: "Access Key ID Secret is required" }),
  bedrockSecretAccessKeySecretName: z.string().min(1, { message: "Secret Access Key Secret is required" }),
  region: z.string().nullish(),
  modelARN: z.string().nullish()
})

const schema = z.discriminatedUnion("type", [
  openaiSchema,
  azureSchema,
  bedrockSchema
]);

type FormValues = z.infer<typeof schema>

function getResetValues(currentFormValues: FormValues): FormValues {
  switch (currentFormValues.type) {
    case "openai":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? ''
      }
    case "azure":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        secret: currentFormValues.secret ?? '',
        baseUrl: currentFormValues.baseUrl ?? '',
        azureApiVersion: ''
      }
    case "bedrock":
      return {
        name: currentFormValues.name,
        type: currentFormValues.type,
        model: currentFormValues.model,
        bedrockAccessKeyIdSecretName: '',
        bedrockSecretAccessKeySecretName: '',
        region: '',
        modelARN: ''
      }
  }
}

const formId = "modelConfiguratorForm"

type ModelConfiguratorFormProps = {
  defaultName?: string
}

export function ModelConfiguratorForm({ defaultName }: ModelConfiguratorFormProps) {
  const router = useRouter()
  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultName || '',
      type: 'openai',
      model: '',
      secret: '',
      baseUrl: ''
    }
  })

  const type = form.watch('type')

  const {
    data: secrets,
    isPending: isSecretsPending,
    error: secretsError
  } = useGetAllSecrets()

  const handleSuccess = useCallback(() => {
    router.push("/models")
  }, [router])

  const { mutate, isPending } = useCreateModel({
    onSuccess: handleSuccess
  })

  useEffect(() => {
    if (secretsError) {
      toast({
        variant: "destructive",
        title: "Failed to get secrets",
        description:
          secretsError instanceof Error
            ? secretsError.message
            : "An unexpected error occurred"
      });
    }
  }, [secretsError]);

  useEffect(() => {
    const currentValues = form.getValues()
    form.reset(getResetValues(currentValues))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const onSubmit = (formValues: FormValues) => {
    const config = createConfig(formValues)
    mutate({
      name: formValues.name,
      type: formValues.type,
      model: formValues.model,
      config
    })
  }

  return (
    <SecretDialogProvider formValueSetter={form.setValue}>
      <div className="md:w-md md:max-w-md shrink-0 space-y-4">
        <section>
          <div className="text-lg leading-none font-semibold">
            Add New Model
          </div>
          <span className="text-muted-foreground text-sm text-pretty">
            Fill in the information for the new model.
          </span>
        </section>
        <section>
          <Form {...form}>
            <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name='name'
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., gpt-4-turbo"
                        className={fieldState.error ? "border-red-500" : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="azure">Azure OpenAI</SelectItem>
                        <SelectItem value="bedrock">AWS Bedrock</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='model'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={type === "openai" ? "e.g., gpt-4-turbo-preview" : type === "azure" ? "e.g., gpt-4" : "e.g., anthropic.claude-v2"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {type === 'openai' && (
                <OpenAISpecificFields
                  isSecretsPending={isSecretsPending}
                  secrets={secrets}
                  control={form.control}
                />
              )}
              {type === 'azure' && (
                <AzureSpecificFields
                  isSecretsPending={isSecretsPending}
                  secrets={secrets}
                  control={form.control}
                />
              )}
              {type === 'bedrock' && (
                <AWSBedrockSpecificFields
                  isSecretsPending={isSecretsPending}
                  secrets={secrets}
                  control={form.control}
                />
              )}
            </form>
          </Form>
        </section>
        <section className="mt-8">
          <Button
            type="submit"
            form={formId}
            disabled={isPending}
            className="w-full"
          >
            {
              isPending ? (<>
                <Spinner size="sm" />
                <span>Adding Model...</span>
              </>) : (<span>Add Model</span>)
            }
          </Button>
        </section>
      </div>
      <CreateNewSecretDialog />
    </SecretDialogProvider>
  )
}

type OpenAISpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[]
  control: Control<FormValues, unknown, FormValues>
}

function OpenAISpecificFields({ isSecretsPending, secrets, control }: OpenAISpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name='secret'
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Key</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <div className="flex gap-4">
                  <SelectTrigger>
                    <SelectValue placeholder="Select a secret" />
                  </SelectTrigger>
                  <CreateNewSecretButton fieldName="secret" />
                </div>
              </FormControl>
              <SelectContent>
                {
                  isSecretsPending ? (
                    <Spinner size="sm" className="mx-auto my-2" />
                  ) : (
                    <>
                      {secrets?.map((secret) => (
                        <SelectItem key={secret.name} value={secret.name}>
                          {secret.name}
                        </SelectItem>
                      ))}
                    </>
                  )
                }
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='baseUrl'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Base URL</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="https://api.openai.com/v1" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

type AzureSpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[]
  control: Control<FormValues, unknown, FormValues>
}

function AzureSpecificFields({ control, isSecretsPending, secrets }: AzureSpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name='secret'
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Key</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <div className="flex gap-4">
                  <SelectTrigger>
                    <SelectValue placeholder="Select a secret" />
                  </SelectTrigger>
                  <CreateNewSecretButton fieldName="secret" />
                </div>
              </FormControl>
              <SelectContent>
                {
                  isSecretsPending ? (
                    <Spinner size="sm" className="mx-auto my-2" />
                  ) : (
                    <>
                      {secrets?.map((secret) => (
                        <SelectItem key={secret.name} value={secret.name}>
                          {secret.name}
                        </SelectItem>
                      ))}
                    </>
                  )
                }
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='baseUrl'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Base URL</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="https://your-resource.openai.azure.com/" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='azureApiVersion'
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Version (Optional)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="2023-05-15" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

type AWSBedrockSpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[]
  control: Control<FormValues, unknown, FormValues>
}

function AWSBedrockSpecificFields({ control, isSecretsPending, secrets }: AWSBedrockSpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name='bedrockAccessKeyIdSecretName'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Access Key ID Secret</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <div className="flex gap-4">
                  <SelectTrigger>
                    <SelectValue placeholder="Select a secret for Access Key ID" />
                  </SelectTrigger>
                  <CreateNewSecretButton fieldName="bedrockAccessKeyIdSecretName" />
                </div>
              </FormControl>
              <SelectContent>
                {
                  isSecretsPending ? (
                    <Spinner size="sm" className="mx-auto my-2" />
                  ) : (
                    <>
                      {secrets?.map((secret) => (
                        <SelectItem key={secret.name} value={secret.name}>
                          {secret.name}
                        </SelectItem>
                      ))}
                    </>
                  )
                }
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='bedrockSecretAccessKeySecretName'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Secret Access Key Secret</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <div className="flex gap-4">
                  <SelectTrigger>
                    <SelectValue placeholder="Select a secret for Secret Access Key" />
                  </SelectTrigger>
                  <CreateNewSecretButton fieldName="bedrockSecretAccessKeySecretName" />
                </div>
              </FormControl>
              <SelectContent>
                {
                  isSecretsPending ? (
                    <Spinner size="sm" className="mx-auto my-2" />
                  ) : (
                    <>
                      {secrets?.map((secret) => (
                        <SelectItem key={secret.name} value={secret.name}>
                          {secret.name}
                        </SelectItem>
                      ))}
                    </>
                  )
                }
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='region'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Region (Optional)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="us-east-1" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name='modelARN'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Model ARN (Optional)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="arn:aws:bedrock:..." />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

const newSecretSchema = z.object({
  name: kubernetesNameSchema,
  password: z.string().min(1, "Value is required")
})

type NewSecretData = z.infer<typeof newSecretSchema>

type FormFields = KeysOfUnion<FormValues>

interface SecretDialogContext {
  form: UseFormReturn<NewSecretData, unknown, NewSecretData>;
  isPending: boolean;
  handleSubmit: (formValues: NewSecretData) => void;
  setFieldToSet: Dispatch<SetStateAction<FormFields | undefined>>
}

const SecretDialogContext = createContext<SecretDialogContext | undefined>(
  undefined
);

type SecretDialogProviderProps = {
  formValueSetter: UseFormSetValue<FormValues>
}

function SecretDialogProvider({ children, formValueSetter }: PropsWithChildren<SecretDialogProviderProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [fieldToSet, setFieldToSet] = useState<FormFields | undefined>(undefined)

  const form = useForm<NewSecretData>({
    mode: 'onChange',
    resolver: zodResolver(newSecretSchema),
    defaultValues: {
      name: '',
      password: ''
    }
  })

  const toggleDialog = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleSuccess = useCallback((data: SecretDetailResponse) => {
    if (fieldToSet) {
      formValueSetter(fieldToSet, data.name)
      setFieldToSet(undefined)
    }
    toggleDialog()
  }, [toggleDialog, formValueSetter, fieldToSet])

  const { mutate, isPending } = useCreateSecret({ onSuccess: handleSuccess })

  const handleSubmit = useCallback((formValues: NewSecretData) => {
    mutate(formValues)
  }, [mutate])

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      form.reset()
    }
    toggleDialog()
  }, [toggleDialog, form])

  return (
    <SecretDialogContext.Provider value={{
      form,
      isPending,
      handleSubmit,
      setFieldToSet
    }}>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </Dialog>
    </SecretDialogContext.Provider>
  );
};

function useSecretDialog() {
  const context = useContext(SecretDialogContext);
  if (!context) {
    throw new Error('useSecretDialog must be used within a SecretDialogProvider');
  }

  return context;
};

type CreateNewSecretButtonProps = {
  fieldName: FormFields
}

function CreateNewSecretButton({ fieldName }: CreateNewSecretButtonProps) {
  const { setFieldToSet } = useSecretDialog()

  const handleClick = useCallback(() => {
    setFieldToSet(fieldName)
  }, [setFieldToSet, fieldName])

  return (
    <DialogTrigger asChild onClick={handleClick}>
      <Button type="button" variant="outline" size="default" className="">
        Add New
      </Button>
    </DialogTrigger>
  )
}


function CreateNewSecretDialog() {
  const { form, handleSubmit, isPending } = useSecretDialog()

  return (
    <DialogContent className="sm:max-w-[425px]">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogHeader>
            <DialogTitle>Add New Secret</DialogTitle>
            <DialogDescription>
              Enter the details for the new secret.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. api-key-production" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input {...field}
                      type="password"
                      placeholder="Enter the secret token"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (<>
                <Spinner size="sm" className="mx-auto my-2" />
                <span>Adding Secret...</span>
              </>) : (<span>Add Secret</span>)}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  )
}

function createConfig(formValues: FormValues): ModelCreateRequest["config"] {
  const config: ModelCreateRequest["config"] = {}
  switch (formValues.type) {
    case "openai":
      config.openai = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: "token"
            }
          }
        },
        baseUrl: formValues.baseUrl
      }
      return config
    case "azure":
      config.azure = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: "token"
            }
          }
        },
        baseUrl: formValues.baseUrl,
        ...(formValues.azureApiVersion && { apiVersion: formValues.azureApiVersion })
      }
      return config
    case "bedrock":
      config.bedrock = {
        accessKeyId: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockAccessKeyIdSecretName,
              key: "token"
            }
          }
        },
        secretAccessKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockSecretAccessKeySecretName,
              key: "token"
            }
          }
        },
        ...(formValues.region && { region: formValues.region }),
        ...(formValues.modelARN && { modelArn: formValues.modelARN })
      }
      return config
  }
}