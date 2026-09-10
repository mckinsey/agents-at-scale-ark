'use client';

import { useEffect } from 'react';
import type { Control } from 'react-hook-form';
import { useFormContext, useWatch } from 'react-hook-form';

import { CreateResourceButton } from '@/components/forms/shared/create-resource-dialog';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
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
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import {
  AZURE_AUTH_METHOD_DISPLAY_NAMES,
  MODEL_PROVIDER_DISPLAY_NAMES,
  SUPPORTED_MODEL_PROVIDERS,
  getModelTypeDisplayName,
} from '@/lib/constants/model-types';
import type { Configuration, Secret } from '@/lib/services';
import { useGetAllConfigurations } from '@/lib/services/configurations-hooks';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';
import type { KeysOfUnion } from '@/lib/types/utils';
import { cn } from '@/lib/utils';

import { useModelConfigurationForm } from './model-configuration-form-context';
import type { FormValues } from './schema';
import type { BaseUrlFieldState } from './utils';

export function ModelConfiguratorForm() {
  const { form, formId, onSubmit, provider, disabledFields, baseUrlState } =
    useModelConfigurationForm();

  const {
    data: secrets,
    isPending: isSecretsPending,
    error: secretsError,
  } = useGetAllSecrets();

  const {
    data: configurations,
    isPending: isConfigurationsPending,
    error: configurationsError,
  } = useGetAllConfigurations();

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

  useEffect(() => {
    if (configurationsError) {
      toast.error('Failed to get configurations', {
        description:
          configurationsError instanceof Error
            ? configurationsError.message
            : 'An unexpected error occurred',
      });
    }
  }, [configurationsError]);

  return (
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
                items={MODEL_PROVIDER_DISPLAY_NAMES}
                onValueChange={field.onChange}
                value={field.value}
                disabled={disabledFields?.provider}>
                <SelectTrigger
                  aria-label="Provider"
                  className={cn(GHOST_TRIGGER, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-fill-onsurface-ui-2">
                  {SUPPORTED_MODEL_PROVIDERS.map(value => (
                    <SelectItem key={value} value={value}>
                      <SelectItemText>
                        {MODEL_PROVIDER_DISPLAY_NAMES[value]}
                      </SelectItemText>
                    </SelectItem>
                  ))}
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
            isConfigurationsPending={isConfigurationsPending}
            configurations={configurations}
            baseUrlState={baseUrlState}
            control={form.control}
          />
        )}
        {provider === 'azure' && (
          <AzureSpecificFields
            isSecretsPending={isSecretsPending}
            secrets={secrets}
            isConfigurationsPending={isConfigurationsPending}
            configurations={configurations}
            baseUrlState={baseUrlState}
            control={form.control}
          />
        )}
        {provider === 'bedrock' && (
          <AWSBedrockSpecificFields
            isSecretsPending={isSecretsPending}
            secrets={secrets}
            isConfigurationsPending={isConfigurationsPending}
            configurations={configurations}
            baseUrlState={baseUrlState}
            control={form.control}
          />
        )}
        {provider === 'anthropic' && (
          <AnthropicSpecificFields
            isSecretsPending={isSecretsPending}
            secrets={secrets}
            isConfigurationsPending={isConfigurationsPending}
            configurations={configurations}
            baseUrlState={baseUrlState}
            control={form.control}
          />
        )}
      </form>
    </Form>
  );
}

type ProviderFieldsProps = {
  isSecretsPending: boolean;
  secrets?: Secret[];
  isConfigurationsPending: boolean;
  configurations?: Configuration[];
  baseUrlState?: BaseUrlFieldState;
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
  const { setValue } = useFormContext<FormValues>();

  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>{label}</FieldTitle>
          <Select
            onValueChange={value => field.onChange(value ?? '')}
            value={field.value as string}>
            <div className="flex items-center gap-3">
              <SelectTrigger className={cn(GHOST_TRIGGER, 'flex-1')}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <CreateResourceButton
                kind="secret"
                onCreated={name =>
                  setValue(fieldName, name, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
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

const CLEAR_BASE_URL_VALUE = '__none__';

function BaseUrlField({
  control,
  placeholder,
  configurations,
  isConfigurationsPending,
  baseUrlState,
  optional = false,
}: {
  control: Control<FormValues, unknown, FormValues>;
  placeholder: string;
  configurations?: Configuration[];
  isConfigurationsPending: boolean;
  baseUrlState?: BaseUrlFieldState;
  optional?: boolean;
}) {
  const { setValue } = useFormContext<FormValues>();

  return (
    <FormField
      control={control}
      name="baseUrl"
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>Base URL{optional ? ' (Optional)' : ''}</FieldTitle>
          {baseUrlState?.kind === 'literal' && (
            <p className="text-sm">
              This URL is currently stored in the model itself:{' '}
              {baseUrlState.url}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Select
              onValueChange={value =>
                field.onChange(value === CLEAR_BASE_URL_VALUE ? '' : value)
              }
              value={(field.value as string) ?? ''}>
              <SelectTrigger
                className={cn(GHOST_TRIGGER, 'flex-1')}
                aria-invalid={!!fieldState.error}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {isConfigurationsPending ? (
                  <Spinner size="sm" className="mx-auto my-2" />
                ) : (
                  <>
                    {optional && (
                      <SelectItem value={CLEAR_BASE_URL_VALUE}>
                        <SelectItemText>
                          None (use the default endpoint)
                        </SelectItemText>
                      </SelectItem>
                    )}
                    {configurations?.map(configuration => (
                      <SelectItem
                        key={configuration.name}
                        value={configuration.name}>
                        <SelectItemText>{configuration.name}</SelectItemText>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <CreateResourceButton
              kind="configuration"
              label={
                baseUrlState?.kind === 'literal'
                  ? 'Move to configuration'
                  : 'Add New'
              }
              dialogTitle={
                baseUrlState?.kind === 'literal'
                  ? 'Move URL to a configuration'
                  : undefined
              }
              defaultValue={
                baseUrlState?.kind === 'literal' ? baseUrlState.url : undefined
              }
              onCreated={name =>
                setValue('baseUrl', name, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
          </div>
          {configurations?.length === 0 && (
            <p className="text-sm">No configurations in this namespace.</p>
          )}
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}

function OpenAISpecificFields({
  isSecretsPending,
  secrets,
  isConfigurationsPending,
  configurations,
  baseUrlState,
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
      <BaseUrlField
        control={control}
        placeholder="Select a configuration"
        configurations={configurations}
        isConfigurationsPending={isConfigurationsPending}
        baseUrlState={baseUrlState}
      />
    </>
  );
}

type AzureSpecificFieldsProps = ProviderFieldsProps;

function AzureSpecificFields({
  control,
  isSecretsPending,
  secrets,
  isConfigurationsPending,
  configurations,
  baseUrlState,
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
              items={AZURE_AUTH_METHOD_DISPLAY_NAMES}
              onValueChange={field.onChange}
              value={field.value ?? 'apiKey'}>
              <SelectTrigger
                aria-label="Authentication"
                className={cn(GHOST_TRIGGER, 'w-full')}>
                <SelectValue placeholder="Select auth method" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {Object.entries(AZURE_AUTH_METHOD_DISPLAY_NAMES).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      <SelectItemText>{label}</SelectItemText>
                    </SelectItem>
                  ),
                )}
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
      <BaseUrlField
        control={control}
        placeholder="Select a configuration"
        configurations={configurations}
        isConfigurationsPending={isConfigurationsPending}
        baseUrlState={baseUrlState}
      />
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
  isConfigurationsPending,
  configurations,
  baseUrlState,
}: ProviderFieldsProps) {
  const { initialBedrockAuthMethod } = useModelConfigurationForm();
  const watchedAuthMethod = useWatch({
    control,
    name: 'bedrockAuthMethod',
  });
  const bedrockAuthMethod =
    watchedAuthMethod ?? initialBedrockAuthMethod ?? 'iam';
  return (
    <>
      <FormField
        control={control}
        name="bedrockAuthMethod"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authentication</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? 'iam'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select auth method" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="iam">IAM Credentials</SelectItem>
                <SelectItem value="apiKey">API Key (Bearer Token)</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              IAM: access key ID and secret access key. API Key: a Bedrock
              bearer token. When both are set, the API key takes precedence.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {bedrockAuthMethod === 'apiKey' ? (
        <SecretSelectorField
          control={control}
          isSecretsPending={isSecretsPending}
          secrets={secrets}
          fieldName="bedrockApiKeySecretName"
          label="API Key Secret"
          placeholder="Select a secret for the API key"
        />
      ) : (
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
        </>
      )}
      <BaseUrlField
        control={control}
        placeholder="Select a configuration"
        configurations={configurations}
        isConfigurationsPending={isConfigurationsPending}
        baseUrlState={baseUrlState}
        optional
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
  isConfigurationsPending,
  configurations,
  baseUrlState,
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
      <BaseUrlField
        control={control}
        placeholder="Select a configuration"
        configurations={configurations}
        isConfigurationsPending={isConfigurationsPending}
        baseUrlState={baseUrlState}
      />
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
