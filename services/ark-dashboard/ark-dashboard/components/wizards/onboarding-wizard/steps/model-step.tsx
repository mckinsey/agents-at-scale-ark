'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
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
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { ModelCreateRequest, Secret } from '@/lib/services';
import { modelsService } from '@/lib/services/models';
import {
  useCreateSecret,
  useGetAllSecrets,
} from '@/lib/services/secrets-hooks';

import { DEFAULT_MODEL_NAME } from '../constants';
import { useWizard } from '../wizard-context';

const openaiSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().optional(),
});

const azureSchema = z.object({
  provider: z.literal('azure'),
  model: z.string().min(1, { message: 'Model is required' }),
  secret: z.string().min(1, { message: 'API Key is required' }),
  baseUrl: z.string().min(1, { message: 'Base URL is required' }),
  azureApiVersion: z.string().optional(),
});

const bedrockSchema = z.object({
  provider: z.literal('bedrock'),
  model: z.string().min(1, { message: 'Model is required' }),
  bedrockAccessKeyIdSecretName: z
    .string()
    .min(1, { message: 'Access Key ID Secret is required' }),
  bedrockSecretAccessKeySecretName: z
    .string()
    .min(1, { message: 'Secret Access Key Secret is required' }),
  region: z.string().optional(),
});

const schema = z.discriminatedUnion('provider', [
  openaiSchema,
  azureSchema,
  bedrockSchema,
]);

type FormValues = z.infer<typeof schema>;

type NewSecretFormValues = {
  name: string;
  value: string;
};

function createConfig(formValues: FormValues): ModelCreateRequest['config'] {
  const config: ModelCreateRequest['config'] = {};
  switch (formValues.provider) {
    case 'openai':
      config.openai = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: 'token',
            },
          },
        },
        baseUrl: formValues.baseUrl || 'https://api.openai.com/v1',
      };
      return config;
    case 'azure':
      config.azure = {
        apiKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.secret,
              key: 'token',
            },
          },
        },
        baseUrl: formValues.baseUrl,
        ...(formValues.azureApiVersion && {
          apiVersion: formValues.azureApiVersion,
        }),
      };
      return config;
    case 'bedrock':
      config.bedrock = {
        accessKeyId: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockAccessKeyIdSecretName,
              key: 'token',
            },
          },
        },
        secretAccessKey: {
          valueFrom: {
            secretKeyRef: {
              name: formValues.bedrockSecretAccessKeySecretName,
              key: 'token',
            },
          },
        },
        ...(formValues.region && { region: formValues.region }),
      };
      return config;
  }
}

export function ModelStep() {
  const { setCurrentStep, setCreatedModelName } = useWizard();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewSecretForm, setShowNewSecretForm] = useState(false);
  const [newSecretData, setNewSecretData] = useState<NewSecretFormValues>({
    name: '',
    value: '',
  });
  const [secretFieldToSet, setSecretFieldToSet] = useState<string | null>(null);

  const {
    data: secrets,
    isPending: isSecretsPending,
    error: secretsError,
  } = useGetAllSecrets();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: 'openai',
      model: '',
      secret: '',
      baseUrl: '',
    },
  });

  const provider = form.watch('provider');

  useEffect(() => {
    if (secretsError) {
      toast.error('Failed to load secrets', {
        description:
          secretsError instanceof Error
            ? secretsError.message
            : 'An unexpected error occurred',
      });
    }
  }, [secretsError]);

  const handleSecretCreated = useCallback(
    (data: { name: string }) => {
      if (secretFieldToSet) {
        form.setValue(secretFieldToSet as keyof FormValues, data.name);
        setSecretFieldToSet(null);
      }
      setShowNewSecretForm(false);
      setNewSecretData({ name: '', value: '' });
    },
    [form, secretFieldToSet],
  );

  const { mutate: createSecret, isPending: isCreatingSecret } = useCreateSecret(
    {
      onSuccess: handleSecretCreated,
    },
  );

  const handleCreateSecret = () => {
    if (!newSecretData.name || !newSecretData.value) {
      toast.error('Please fill in all secret fields');
      return;
    }
    createSecret({ name: newSecretData.name, password: newSecretData.value });
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const config = createConfig(values);
      await modelsService.create({
        name: DEFAULT_MODEL_NAME,
        provider: values.provider,
        model: values.model,
        config,
      });
      setCreatedModelName(DEFAULT_MODEL_NAME);
      toast.success('Model created successfully');
      setCurrentStep('agent');
    } catch (error) {
      toast.error('Failed to create model', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSecretSelect = (
    fieldName: string,
    label: string,
    placeholder: string,
  ) => (
    <FormField
      control={form.control}
      name={fieldName as keyof FormValues}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex gap-2">
            <Select
              onValueChange={field.onChange}
              value={field.value as string}>
              <FormControl>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {isSecretsPending ? (
                  <div className="flex items-center justify-center p-2">
                    <Spinner size="sm" />
                  </div>
                ) : (
                  secrets?.map((secret: Secret) => (
                    <SelectItem key={secret.name} value={secret.name}>
                      {secret.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSecretFieldToSet(fieldName);
                setShowNewSecretForm(true);
              }}>
              Add New
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Configure Your Model</h3>
        <p className="text-muted-foreground text-sm">
          Set up a default model that your agents will use. This model will be
          named &quot;{DEFAULT_MODEL_NAME}&quot;.
        </p>
      </div>

      {showNewSecretForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="font-medium">Add New Secret</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., openai-api-key"
                value={newSecretData.name}
                onChange={e =>
                  setNewSecretData(prev => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Value</label>
              <Input
                type="password"
                placeholder="Enter the secret value"
                value={newSecretData.value}
                onChange={e =>
                  setNewSecretData(prev => ({ ...prev, value: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowNewSecretForm(false);
                setNewSecretData({ name: '', value: '' });
                setSecretFieldToSet(null);
              }}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateSecret}
              disabled={isCreatingSecret}>
              {isCreatingSecret ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Secret'
              )}
            </Button>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input value={DEFAULT_MODEL_NAME} disabled className="bg-muted" />
            </FormControl>
          </FormItem>

          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider</FormLabel>
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
            <>
              {renderSecretSelect('secret', 'API Key', 'Select a secret')}
              <FormField
                control={form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL (Optional)</FormLabel>
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
          )}

          {provider === 'azure' && (
            <>
              {renderSecretSelect('secret', 'API Key', 'Select a secret')}
              <FormField
                control={form.control}
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
                control={form.control}
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {provider === 'bedrock' && (
            <>
              {renderSecretSelect(
                'bedrockAccessKeyIdSecretName',
                'Access Key ID Secret',
                'Select a secret for Access Key ID',
              )}
              {renderSecretSelect(
                'bedrockSecretAccessKeySecretName',
                'Secret Access Key Secret',
                'Select a secret for Secret Access Key',
              )}
              <FormField
                control={form.control}
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
            </>
          )}

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating Model...
                </>
              ) : (
                'Next: Create Agent'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
