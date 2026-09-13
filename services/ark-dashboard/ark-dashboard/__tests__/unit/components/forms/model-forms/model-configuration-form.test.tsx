import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelConfiguratorForm } from '@/components/forms/model-forms/model-configuration-form';
import { ModelConfigurationFormContext } from '@/components/forms/model-forms/model-configuration-form-context';
import type { FormValues } from '@/components/forms/model-forms/schema';
import { useGetAllConfigurations } from '@/lib/services/configurations-hooks';
import {
  useCreateSecret,
  useGetAllSecrets,
} from '@/lib/services/secrets-hooks';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
  useCreateSecret: vi.fn(),
}));

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetAllConfigurations: vi.fn(),
  useCreateConfiguration: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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

const openaiDefaults = (overrides: Partial<FormValues> = {}): FormValues =>
  ({
    name: 'my-openai-model',
    provider: 'openai',
    model: 'gpt-4o-mini',
    secret: 'openai-token',
    baseUrl: '',
    ...overrides,
  }) as FormValues;

function Harness({
  defaultValues,
  baseUrlState,
}: {
  defaultValues: FormValues;
  baseUrlState?: Parameters<
    typeof ModelConfigurationFormContext.Provider
  >[0]['value']['baseUrlState'];
}) {
  const form = useForm<FormValues>({ defaultValues });
  return (
    <ModelConfigurationFormContext.Provider
      value={{
        formId: 'test-form',
        form,
        provider: defaultValues.provider,
        onSubmit: vi.fn(),
        isSubmitPending: false,
        disabledFields: {},
        initialBedrockAuthMethod:
          defaultValues.provider === 'bedrock'
            ? defaultValues.bedrockAuthMethod
            : undefined,
        baseUrlState,
      }}>
      <ModelConfiguratorForm />
    </ModelConfigurationFormContext.Provider>
  );
}

const renderForm = (
  defaultValues: FormValues,
  baseUrlState?: Parameters<typeof Harness>[0]['baseUrlState'],
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness defaultValues={defaultValues} baseUrlState={baseUrlState} />
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
    vi.mocked(useGetAllConfigurations).mockReturnValue({
      data: [{ id: 'ai-gateway-url', name: 'ai-gateway-url' }],
      isPending: false,
      error: null,
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

describe('ModelConfiguratorForm - Base URL field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: [{ id: 'openai-token', name: 'openai-token' }],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useCreateSecret).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useGetAllConfigurations).mockReturnValue({
      data: [{ id: 'ai-gateway', name: 'ai-gateway' }],
      isPending: false,
      error: null,
    } as never);
  });

  const baseUrlFieldset = () =>
    screen.getByText('Base URL').closest('fieldset') as HTMLElement;

  it('shows the stored value even when it is not in the loaded configurations list', async () => {
    const user = userEvent.setup();
    renderForm(openaiDefaults({ baseUrl: 'deleted-gateway' }));

    await user.click(
      within(baseUrlFieldset()).getByRole('combobox'),
    );

    expect(
      await screen.findByRole('option', {
        name: /deleted-gateway \(not found in this namespace\)/,
      }),
    ).toBeInTheDocument();
  });

  it('does not flag a value that is present in the loaded configurations list', async () => {
    const user = userEvent.setup();
    renderForm(openaiDefaults({ baseUrl: 'ai-gateway' }));

    await user.click(
      within(baseUrlFieldset()).getByRole('combobox'),
    );

    expect(
      screen.queryByRole('option', { name: /not found in this namespace/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the literal hint and "Move to configuration" while the field is untouched', () => {
    renderForm(openaiDefaults({ baseUrl: '' }), {
      kind: 'literal',
      url: 'https://legacy.example/v1',
    });

    expect(
      screen.getByText(/This URL is currently stored in the model itself/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to configuration' }),
    ).toBeInTheDocument();
  });

  it('clears the literal hint once a configuration has been selected in-session', () => {
    renderForm(openaiDefaults({ baseUrl: 'ai-gateway' }), {
      kind: 'literal',
      url: 'https://legacy.example/v1',
    });

    expect(
      screen.queryByText(/This URL is currently stored in the model itself/),
    ).not.toBeInTheDocument();
    expect(
      within(baseUrlFieldset()).getByRole('button', { name: 'Add New' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to configuration' }),
    ).not.toBeInTheDocument();
  });
});
