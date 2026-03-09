import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseGetAllSecrets = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: (...args: unknown[]) => {
    mockUseGetAllSecrets(...args);
    return {
      data: [{ id: 'secret-1', name: 'my-secret' }],
      isPending: false,
      error: null,
    };
  },
  useCreateSecret: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'custom-ns',
    readOnlyMode: false,
    setNamespace: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=custom-ns')),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/models'),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services/models-hooks', () => ({
  useCreateModel: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/tracked-button', () => ({
  TrackedButton: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      trackingEvent?: string;
      trackingProperties?: Record<string, unknown>;
    },
  ) => {
    const { trackingEvent, trackingProperties, ...rest } = props;
    return <button {...rest} />;
  },
}));

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

import { CreateModelForm } from '@/components/forms/model-forms/create-model-form';

describe('ModelConfiguratorForm namespace support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes namespace to useGetAllSecrets', () => {
    render(<CreateModelForm />);
    expect(mockUseGetAllSecrets).toHaveBeenCalledWith('custom-ns');
  });

  it('includes namespace in mutate call when creating a secret', async () => {
    const user = userEvent.setup();
    render(<CreateModelForm />);

    const addNewButton = screen.getAllByText('Add New')[0];
    await user.click(addNewButton);

    const nameInput = await screen.findByPlaceholderText(
      'e.g. api-key-production',
    );
    const valueInput = await screen.findByPlaceholderText(
      'Enter the secret token',
    );

    await user.type(nameInput, 'new-secret');
    await user.type(valueInput, 'secret-value');

    const addSecretButton = screen.getByText('Add Secret');
    await user.click(addSecretButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'custom-ns' }),
      );
    });
  });
});
