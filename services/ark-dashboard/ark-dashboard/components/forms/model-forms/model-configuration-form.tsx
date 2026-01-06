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
import { useForm } from 'react-hook-form';
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
  Form,
  FormControl,
  FormDescription,
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
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import { useModelConfigurationForm } from './model-configuration-form-context';
import type { FormValues } from './schema';

export function ModelConfiguratorForm() {
  const { form, formId, onSubmit, provider, disabledFields } =
    useModelConfigurationForm();

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
    <SecretDialogProvider formValueSetter={form.setValue}>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="e.g., gpt-4-turbo"
                    className={fieldState.error ? 'border-red-500' : undefined}
                    disabled={disabledFields?.name}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>Type</FormLabel>
            <FormControl>
              <Input
                value={getModelTypeDisplayName('completions')}
                disabled={true}
                className="bg-muted"
              />
            </FormControl>
          </FormItem>
          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={disabledFields?.provider}>
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
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={
                      provider === 'openai'
                        ? 'e.g., gpt-4-turbo-preview'
                        : provider === 'azure'
                          ? 'e.g., gpt-4'
                          : 'e.g., anthropic.claude-v2'
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
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
        </form>
      </Form>
      <CreateNewSecretDialog />
    </SecretDialogProvider>
  );
}

type OpenAISpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[];
  control: Control<FormValues, unknown, FormValues>;
};

function OpenAISpecificFields({
  isSecretsPending,
  secrets,
  control,
}: OpenAISpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name="secret"
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
                {isSecretsPending ? (
                  <Spinner size="sm" className="mx-auto my-2" />
                ) : (
                  <>
                    {secrets?.map(secret => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="baseUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Base URL</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="https://api.openai.com/v1"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

type AzureSpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[];
  control: Control<FormValues, unknown, FormValues>;
};

function AzureSpecificFields({
  control,
  isSecretsPending,
  secrets,
}: AzureSpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name="secret"
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
                {isSecretsPending ? (
                  <Spinner size="sm" className="mx-auto my-2" />
                ) : (
                  <>
                    {secrets?.map(secret => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="baseUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Base URL</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="https://your-resource.openai.azure.com/"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="azureApiVersion"
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Version (Optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="2023-05-15"
              />
            </FormControl>
            <FormDescription>
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
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

type AWSBedrockSpecificFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[];
  control: Control<FormValues, unknown, FormValues>;
};

function AWSBedrockSpecificFields({
  control,
  isSecretsPending,
  secrets,
}: AWSBedrockSpecificFieldsProps) {
  return (
    <>
      <FormField
        control={control}
        name="bedrockAccessKeyIdSecretName"
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
                {isSecretsPending ? (
                  <Spinner size="sm" className="mx-auto my-2" />
                ) : (
                  <>
                    {secrets?.map(secret => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="bedrockSecretAccessKeySecretName"
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
                {isSecretsPending ? (
                  <Spinner size="sm" className="mx-auto my-2" />
                ) : (
                  <>
                    {secrets?.map(secret => (
                      <SelectItem key={secret.name} value={secret.name}>
                        {secret.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="region"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Region (Optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="us-east-1"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="modelARN"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Model ARN (Optional)</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="arn:aws:bedrock:..."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
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
};

function SecretDialogProvider({
  children,
  formValueSetter,
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
