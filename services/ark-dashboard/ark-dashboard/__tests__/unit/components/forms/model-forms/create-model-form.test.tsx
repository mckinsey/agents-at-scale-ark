import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateModelForm } from '@/components/forms/model-forms/create-model-form';
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

vi.mock('@/lib/services/models-hooks', () => ({
  useCreateModel: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn() }),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode: false }),
}));

vi.mock('@/lib/analytics/hooks', () => ({
  useTrackClick: () => vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateModelForm />
    </QueryClientProvider>,
  );
};

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  optionName: RegExp,
) {
  await user.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  await user.click(option);
}

describe('CreateModelForm - AWS Bedrock (issue #2810)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: [{ id: 'aws-bedrock', name: 'aws-bedrock' }],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useCreateSecret).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useGetSecret).mockReturnValue({
      data: { keys: ['token'] },
      isPending: false,
    } as never);
  });

  // Regression: selecting bedrock must not surface "required" errors for the
  // disabled key selectors before the user has interacted with the form.
  it('shows no required-field errors right after selecting bedrock (IAM default)', async () => {
    const user = userEvent.setup();
    renderForm();

    const providerTrigger = screen.getByRole('combobox', { name: /provider/i });
    await selectOption(user, providerTrigger, /AWS Bedrock/i);

    expect(await screen.findByText('Access Key ID Secret')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
    });
  });

  // Regression: the redundant "API Key Secret Key" selector was removed; the
  // key is hardcoded to `token`.
  it('does not render a key selector on the API key path', async () => {
    const user = userEvent.setup();
    renderForm();

    const providerTrigger = screen.getByRole('combobox', { name: /provider/i });
    await selectOption(user, providerTrigger, /AWS Bedrock/i);

    const authTrigger = await screen.findByRole('combobox', {
      name: /authentication/i,
    });
    await selectOption(user, authTrigger, /API Key \(Bearer Token\)/i);

    expect(await screen.findByText('API Key Secret')).toBeInTheDocument();
    expect(screen.queryByText('API Key Secret Key')).not.toBeInTheDocument();
  });
});
