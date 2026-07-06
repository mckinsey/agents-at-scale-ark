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
  useGetSecret,
} from '@/lib/services/secrets-hooks';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
  useGetSecret: vi.fn(),
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
    bedrockAccessKeyIdSecretName: 'aws-credentials',
    bedrockAccessKeyIdSecretKey: '',
    bedrockSecretAccessKeySecretName: 'aws-credentials',
    bedrockSecretAccessKeySecretKey: '',
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
      data: [{ id: 'aws-credentials', name: 'aws-credentials' }],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useCreateSecret).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useGetSecret).mockReturnValue({
      data: { keys: ['accessKeyId', 'secretAccessKey'] },
      isPending: false,
    } as never);
  });

  it('renders per-credential secret and key selectors for bedrock', () => {
    renderForm(bedrockDefaults());

    expect(screen.getByText('Access Key ID Secret')).toBeInTheDocument();
    expect(screen.getByText('Access Key ID Secret Key')).toBeInTheDocument();
    expect(screen.getByText('Secret Access Key Secret')).toBeInTheDocument();
    expect(screen.getByText('Secret Access Key Secret Key')).toBeInTheDocument();
    expect(useGetSecret).toHaveBeenCalledWith('aws-credentials');
  });

  it('disables the key selector and queries no secret when none is selected', () => {
    renderForm(
      bedrockDefaults({
        bedrockAccessKeyIdSecretName: '',
        bedrockSecretAccessKeySecretName: '',
      }),
    );

    expect(useGetSecret).toHaveBeenCalledWith(undefined);
    expect(screen.getAllByText('Select a secret first').length).toBeGreaterThan(
      0,
    );
  });
});
