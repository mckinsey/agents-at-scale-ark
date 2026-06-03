'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Dispatch, PropsWithChildren, SetStateAction } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Control, UseFormReturn, UseFormSetValue } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { getModelTypeDisplayName } from '@/lib/constants/model-types';
import type { Secret } from '@/lib/services';
import type { SecretDetailResponse } from '@/lib/services/secrets';
import {
  useCreateSecret,
  useGetAllSecrets,
} from '@/lib/services/secrets-hooks';
import type { KeysOfUnion } from '@/lib/types/utils';
import { cn } from '@/lib/utils';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';
import { useNamespace } from '@/providers/NamespaceProvider';

import { useModelConfigurationForm } from './model-configuration-form-context';
import type { FormValues } from './schema';

const GHOST_TRIGGER =
  'rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40 focus-visible:border-b-stroke-status-focus';

export function ModelConfiguratorForm() {
  const { form, formId, onSubmit, provider, disabledFields } =
    useModelConfigurationForm();
  const { namespace } = useNamespace();

  const {
    data: secrets,
    isPending: isSecretsPending,
    error: secretsError,
  } = useGetAllSecrets();

  useEffect(() => {
    if (secretsError) {
      toast.error('Failed to get secrets', {
        description:
          secretsError instanceof Error
            ? secretsError.message
            : 'An unexpected error occurred',
      });
    }
  }, [secretsError]);

  return (
    <SecretDialogProvider formValueSetter={form.setValue} namespace={namespace}>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <FieldSet className="gap-2">
                <FieldTitle>Name</FieldTitle>
                <Input
                  variant="inline"
                  {...field}
                  placeholder="e.g., gpt-4-turbo"
                  disabled={disabledFields?.name}
                  aria-invalid={!!fieldState.error}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldSet>
            )}
          />
          <FieldSet className="gap-2">
            <FieldTitle>Type</FieldTitle>
            <Input
              variant="inline"
              value={getModelTypeDisplayName('completions')}
              disabled
              readOnly
            />
          </FieldSet>
          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FieldSet className="gap-2">
                <FieldTitle>Provider</FieldTitle>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={disabledFields?.provider}>
                  <SelectTrigger className={cn(GHOST_TRIGGER, 'w-full')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-fill-onsurface-ui-2">
                    <SelectItem value="openai">
                      <SelectItemText>OpenAI</SelectItemText>
                    </SelectItem>
                    <SelectItem value="azure">
                      <SelectItemText>Azure OpenAI</SelectItemText>
                    </SelectItem>
                    <SelectItem value="bedrock">
                      <SelectItemText>AWS Bedrock</SelectItemText>
                    </SelectItem>
                    <SelectItem value="anthropic">
                      <SelectItemText>Anthropic</SelectItemText>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldSet>
            )}
          />
          <FormField
            control={form.control}
            name="model"
            render={({ field, fieldState }) => (
              <FieldSet className="gap-2">
                <FieldTitle>Model</FieldTitle>
                <Input
                  variant="inline"
                  {...field}
                  placeholder={
                    provider === 'openai'
                      ? 'e.g., gpt-4-turbo-preview'
                      : provider === 'azure'
                        ? 'e.g., gpt-4'
                        : provider === 'anthropic'
                          ? 'e.g., claude-sonnet-4-20250514'
                          : 'e.g., anthropic.claude-v2'
                  }
                  aria-invalid={!!fieldState.error}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldSet>
            )}
          />
          {provider === 'openai' && (
            <OpenAISpecificFields
              isSecretsPending={isSecretsPending}
              secrets={secrets}
              control={form.control}
            />
          )}
          {provider === 'azure' && (
            <AzureSpecificFields
              isSecretsPending={isSecretsPending}
              secrets={secrets}
              control={form.control}
            />
          )}
          {provider === 'bedrock' && (
            <AWSBedrockSpecificFields
              isSecretsPending={isSecretsPending}
              secrets={secrets}
              control={form.control}
            />
          )}
          {provider === 'anthropic' && (
            <AnthropicSpecificFields
              isSecretsPending={isSecretsPending}
              secrets={secrets}
              control={form.control}
            />
          )}
        </form>
      </Form>
      <CreateNewSecretDialog />
    </SecretDialogProvider>
  );
}

type ProviderFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[];
  control: Control<FormValues, unknown, FormValues>;
};

function SecretSelectorField({
  control,
  isSecretsPending,
  secrets,
  fieldName,
  label,
  placeholder,
}: {
  control: Control<FormValues, unknown, FormValues>;
  isSecretsPending: boolean;
  secrets?: Secret[];
  fieldName: KeysOfUnion<FormValues>;
  label: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>{label}</FieldTitle>
          <Select onValueChange={field.onChange} value={field.value as string}>
            <div className="flex items-center gap-3">
              <SelectTrigger className={cn(GHOST_TRIGGER, 'flex-1')}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <CreateNewSecretButton fieldName={fieldName} />
            </div>
            <SelectContent className="bg-fill-onsurface-ui-2">
              {isSecretsPending ? (
                <Spinner size="sm" className="mx-auto my-2" />
              ) : (
                <>
                  {secrets?.map(secret => (
                    <SelectItem key={secret.name} value={secret.name}>
                      <SelectItemText>{secret.name}</SelectItemText>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}

function BaseUrlField({
  control,
  placeholder,
}: {
  control: Control<FormValues, unknown, FormValues>;
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name="baseUrl"
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>Base URL</FieldTitle>
          <Input
            variant="inline"
            {...field}
            value={field.value ?? ''}
            placeholder={placeholder}
            aria-invalid={!!fieldState.error}
          />
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}

function OpenAISpecificFields({
  isSecretsPending,
  secrets,
  control,
}: ProviderFieldsProps) {
  return (
    <>
      <SecretSelectorField
        control={control}
        isSecretsPending={isSecretsPending}
        secrets={secrets}
        fieldName="secret"
        label="API Key"
        placeholder="Select a secret"
      />
      <BaseUrlField control={control} placeholder="https://api.openai.com/v1" />
    </>
  );
}

type AzureSpecificFieldsProps = ProviderFieldsProps;

function AzureSpecificFields({
  control,
  isSecretsPending,
  secrets,
}: AzureSpecificFieldsProps) {
  const { initialAzureAuthMethod } = useModelConfigurationForm();
  const watchedAuthMethod = useWatch({
    control,
    name: 'azureAuthMethod',
  });
  const azureAuthMethod =
    watchedAuthMethod ?? initialAzureAuthMethod ?? 'apiKey';
  return (
    <>
      <FormField
        control={control}
        name="azureAuthMethod"
        render={({ field }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Authentication</FieldTitle>
            <Select
              onValueChange={field.onChange}
              value={field.value ?? 'apiKey'}>
              <SelectTrigger className={cn(GHOST_TRIGGER, 'w-full')}>
                <SelectValue placeholder="Select auth method" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                <SelectItem value="apiKey">
                  <SelectItemText>API Key</SelectItemText>
                </SelectItem>
                <SelectItem value="managedIdentity">
                  <SelectItemText>Managed Identity</SelectItemText>
                </SelectItem>
                <SelectItem value="workloadIdentity">
                  <SelectItemText>Workload Identity</SelectItemText>
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              API Key: use a secret. Managed Identity: AKS node identity.
              Workload Identity: K8s ServiceAccount federated to Azure.
            </FieldDescription>
          </FieldSet>
        )}
      />
      {azureAuthMethod === 'apiKey' ? (
        <SecretSelectorField
          control={control}
          isSecretsPending={isSecretsPending}
          secrets={secrets}
          fieldName="secret"
          label="API Key"
          placeholder="Select a secret"
        />
      ) : (
        <>
          <FormField
            control={control}
            name="azureClientId"
            render={({ field, fieldState }) => (
              <FieldSet className="gap-2">
                <FieldTitle>
                  Client ID
                  {azureAuthMethod === 'managedIdentity' ? ' (optional)' : ''}
                </FieldTitle>
                <Input
                  variant="inline"
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Azure Managed Identity client ID (GUID)"
                  aria-invalid={!!fieldState.error}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldSet>
            )}
          />
          {azureAuthMethod === 'workloadIdentity' && (
            <FormField
              control={control}
              name="azureTenantId"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>Tenant ID</FieldTitle>
                  <Input
                    variant="inline"
                    {...field}
                    value={field.value ?? ''}
                    placeholder="Azure AD tenant ID (GUID)"
                    aria-invalid={!!fieldState.error}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />
          )}
        </>
      )}
      <BaseUrlField control={control} placeholder="https://your-resource.openai.azure.com/" />
      <FormField
        control={control}
        name="azureApiVersion"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>API Version (Optional)</FieldTitle>
            <Input
              variant="inline"
              {...field}
              value={field.value ?? ''}
              placeholder="2023-05-15"
              aria-invalid={!!fieldState.error}
            />
            <FieldDescription>
              If your instance is opted in to the{' '}
              <a
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
                href="https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle?tabs=python"
                target="_blank">
                next-generation v1 Azure OpenAI APIs
              </a>
              , this field is optional. Otherwise, you must provide an API
              version.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />
    </>
  );
}

function AWSBedrockSpecificFields({
  control,
  isSecretsPending,
  secrets,
}: ProviderFieldsProps) {
  return (
    <>
      <SecretSelectorField
        control={control}
        isSecretsPending={isSecretsPending}
        secrets={secrets}
        fieldName="bedrockAccessKeyIdSecretName"
        label="Access Key ID Secret"
        placeholder="Select a secret for Access Key ID"
      />
      <SecretSelectorField
        control={control}
        isSecretsPending={isSecretsPending}
        secrets={secrets}
        fieldName="bedrockSecretAccessKeySecretName"
        label="Secret Access Key Secret"
        placeholder="Select a secret for Secret Access Key"
      />
      <FormField
        control={control}
        name="region"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Region (Optional)</FieldTitle>
            <Input
              variant="inline"
              {...field}
              value={field.value ?? ''}
              placeholder="us-east-1"
              aria-invalid={!!fieldState.error}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />
      <FormField
        control={control}
        name="modelARN"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Model ARN (Optional)</FieldTitle>
            <Input
              variant="inline"
              {...field}
              value={field.value ?? ''}
              placeholder="arn:aws:bedrock:..."
              aria-invalid={!!fieldState.error}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />
    </>
  );
}

function AnthropicSpecificFields({
  isSecretsPending,
  secrets,
  control,
}: ProviderFieldsProps) {
  return (
    <>
      <SecretSelectorField
        control={control}
        isSecretsPending={isSecretsPending}
        secrets={secrets}
        fieldName="secret"
        label="API Key"
        placeholder="Select a secret"
      />
      <BaseUrlField control={control} placeholder="https://api.anthropic.com" />
      <FormField
        control={control}
        name="anthropicVersion"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Anthropic Version (Optional)</FieldTitle>
            <Input
              variant="inline"
              {...field}
              value={field.value ?? ''}
              placeholder="2023-06-01"
              aria-invalid={!!fieldState.error}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />
    </>
  );
}

const newSecretSchema = z.object({
  name: kubernetesNameSchema,
  password: z.string().min(1, 'Value is required'),
});

type NewSecretData = z.infer<typeof newSecretSchema>;

type FormFields = KeysOfUnion<FormValues>;

interface SecretDialogContext {
  form: UseFormReturn<NewSecretData, unknown, NewSecretData>;
  isPending: boolean;
  handleSubmit: (formValues: NewSecretData) => void;
  setFieldToSet: Dispatch<SetStateAction<FormFields | undefined>>;
}

const SecretDialogContext = createContext<SecretDialogContext | undefined>(
  undefined,
);

type SecretDialogProviderProps = {
  formValueSetter: UseFormSetValue<FormValues>;
  namespace: string;
};

function SecretDialogProvider({
  children,
  formValueSetter,
  namespace,
}: PropsWithChildren<SecretDialogProviderProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [fieldToSet, setFieldToSet] = useState<FormFields | undefined>(
    undefined,
  );

  const form = useForm<NewSecretData>({
    mode: 'onChange',
    resolver: zodResolver(newSecretSchema),
    defaultValues: {
      name: '',
      password: '',
    },
  });

  const toggleDialog = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleSuccess = useCallback(
    (data: SecretDetailResponse) => {
      if (fieldToSet) {
        formValueSetter(fieldToSet, data.name);
        setFieldToSet(undefined);
      }
      toggleDialog();
    },
    [toggleDialog, formValueSetter, fieldToSet],
  );

  const { mutate, isPending } = useCreateSecret({ onSuccess: handleSuccess });

  const handleSubmit = useCallback(
    (formValues: NewSecretData) => {
      mutate(formValues);
    },
    [mutate],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        form.reset();
      }
      toggleDialog();
    },
    [toggleDialog, form],
  );

  return (
    <SecretDialogContext.Provider
      value={{
        form,
        isPending,
        handleSubmit,
        setFieldToSet,
      }}>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        {children}
      </Dialog>
    </SecretDialogContext.Provider>
  );
}

function useSecretDialog() {
  const context = useContext(SecretDialogContext);
  if (!context) {
    throw new Error(
      'useSecretDialog must be used within a SecretDialogProvider',
    );
  }

  return context;
}

type CreateNewSecretButtonProps = {
  fieldName: FormFields;
};

function CreateNewSecretButton({ fieldName }: CreateNewSecretButtonProps) {
  const { setFieldToSet } = useSecretDialog();

  const handleClick = useCallback(() => {
    setFieldToSet(fieldName);
  }, [setFieldToSet, fieldName]);

  return (
    <DialogTrigger asChild onClick={handleClick}>
      <Button type="button" variant="outline" size="default" className="">
        Add New
      </Button>
    </DialogTrigger>
  );
}

function CreateNewSecretDialog() {
  const { form, handleSubmit, isPending } = useSecretDialog();

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
              name="name"
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Value</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
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
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner size="sm" className="mx-auto my-2" />
                  <span>Adding Secret...</span>
                </>
              ) : (
                <span>Add Secret</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
