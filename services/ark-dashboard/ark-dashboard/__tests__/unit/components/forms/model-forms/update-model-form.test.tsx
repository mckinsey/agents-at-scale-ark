import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdateModelForm } from '@/components/forms/model-forms/update-model-form';
import type { Model } from '@/lib/services';
import { useGetAllConfigurations } from '@/lib/services/configurations-hooks';
import { useUpdateModelById } from '@/lib/services/models-hooks';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
  useCreateSecret: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetAllConfigurations: vi.fn(),
  useCreateConfiguration: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/lib/services/models-hooks', () => ({
  useUpdateModelById: vi.fn(),
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

const legacyLiteralModel: Model = {
  id: 'legacy-openai',
  name: 'legacy-openai',
  provider: 'openai',
  model: 'gpt-4o-mini',
  config: {
    openai: {
      apiKey: {
        valueFrom: { secretKeyRef: { name: 'openai-token', key: 'token' } },
      },
      baseUrl: { value: 'https://legacy.example/v1' },
    },
  },
} as unknown as Model;

const renderForm = (model: Model) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpdateModelForm model={model} />
    </QueryClientProvider>,
  );
};

describe('UpdateModelForm - editing a model with a legacy literal base URL', () => {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'legacy-openai' });

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ id: 'legacy-openai' });
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: [{ id: 'openai-token', name: 'openai-token' }],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useGetAllConfigurations).mockReturnValue({
      data: [],
      isPending: false,
      error: null,
    } as never);
    vi.mocked(useUpdateModelById).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
  });

  it('submits successfully without forcing migration to a configuration', async () => {
    const user = userEvent.setup();
    renderForm(legacyLiteralModel);

    expect(
      screen.getByText(/This URL is currently stored in the model itself/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /update model/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'legacy-openai',
        model: 'gpt-4o-mini',
        config: {
          openai: {
            apiKey: {
              valueFrom: {
                secretKeyRef: { name: 'openai-token', key: 'token' },
              },
            },
            baseUrl: { value: 'https://legacy.example/v1' },
          },
        },
      });
    });
    expect(screen.queryByText(/base url is required/i)).not.toBeInTheDocument();
  });
});
