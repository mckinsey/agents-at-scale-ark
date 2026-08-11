import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelConfiguratorForm } from '@/components/forms/model-forms/model-configuration-form';
import { ModelConfigurationFormContext } from '@/components/forms/model-forms/model-configuration-form-context';
import type { FormValues } from '@/components/forms/model-forms/schema';
import {
  useCreateSecret,
  useGetAllSecrets,
} from '@/lib/services/secrets-hooks';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
  useCreateSecret: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bedrockDefaults = (overrides: Partial<FormValues> = {}): FormValues =>
  ({
    name: 'my-bedrock',
    provider: 'bedrock',
    model: 'anthropic.claude-v2',
    bedrockAuthMethod: 'iam',
    bedrockApiKeySecretName: '',
    bedrockAccessKeyIdSecretName: 'aws-access-key-id',
    bedrockSecretAccessKeySecretName: 'aws-secret-access-key',
    region: '',
    modelARN: '',
    ...overrides,
  }) as FormValues;

function Harness({ defaultValues }: { defaultValues: FormValues }) {
  const form = useForm<FormValues>({ defaultValues });
  return (
    <ModelConfigurationFormContext.Provider
      value={{
        formId: 'test-form',
        form,
        provider: 'bedrock',
        onSubmit: vi.fn(),
        isSubmitPending: false,
        disabledFields: {},
        initialBedrockAuthMethod:
          defaultValues.provider === 'bedrock'
            ? defaultValues.bedrockAuthMethod
            : undefined,
      }}>
      <ModelConfiguratorForm />
    </ModelConfigurationFormContext.Provider>
  );
}

const renderForm = (defaultValues: FormValues) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness defaultValues={defaultValues} />
    </QueryClientProvider>,
  );
};

describe('ModelConfiguratorForm - AWS Bedrock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: [
        { id: 'aws-access-key-id', name: 'aws-access-key-id' },
        { id: 'aws-secret-access-key', name: 'aws-secret-access-key' },
      ],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useCreateSecret).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it('renders a secret selector per IAM credential, without key selectors', () => {
    renderForm(bedrockDefaults());

    expect(screen.getByText('Access Key ID Secret')).toBeInTheDocument();
    expect(screen.getByText('Secret Access Key Secret')).toBeInTheDocument();
    // The redundant "…Secret Key" selectors were removed (key is always token).
    expect(screen.queryByText('Access Key ID Secret Key')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Secret Access Key Secret Key'),
    ).not.toBeInTheDocument();
  });

  it('renders a single secret selector on the API key path', () => {
    renderForm(bedrockDefaults({ bedrockAuthMethod: 'apiKey' }));

    expect(screen.getByText('API Key Secret')).toBeInTheDocument();
    expect(screen.queryByText('API Key Secret Key')).not.toBeInTheDocument();
  });
});
