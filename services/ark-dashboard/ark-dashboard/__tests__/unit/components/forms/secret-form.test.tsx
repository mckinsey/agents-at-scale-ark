import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseNamespace = vi.fn(() => ({
  namespace: 'default',
  readOnlyMode: false,
}));

interface MockSecret {
  id: string;
  name: string;
  description: string | null;
  alias: string | null;
  labels: string[];
}

interface MockGetSecretResult {
  data: MockSecret | undefined;
  isLoading: boolean;
}

const mockCreateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUseGetSecret = vi.fn<() => MockGetSecretResult>(() => ({
  data: undefined,
  isLoading: false,
}));
const mockUseGetAllSecrets = vi.fn(() => ({ data: [] as MockSecret[] }));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/secrets'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetSecret: () => mockUseGetSecret(),
  useGetAllSecrets: () => mockUseGetAllSecrets(),
  useCreateSecret: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateSecret: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

import { SecretForm } from '@/components/forms/secret-form/secret-form';
import { SecretFormMode } from '@/components/forms/secret-form/types';

const field = (name: string) => screen.getByPlaceholderText(name);

const NAME_FIELD = 'e.g., api-key-production';
const VALUE_FIELD = 'Enter the secret value';
const DESCRIPTION_FIELD = 'e.g., API key used by the production models';
const ALIAS_FIELD = 'e.g., api-key';
const LABEL_FIELD = 'e.g., production';

describe('SecretForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNamespace.mockReturnValue({
      namespace: 'default',
      readOnlyMode: false,
    });
    mockUseGetSecret.mockReturnValue({ data: undefined, isLoading: false });
    mockUseGetAllSecrets.mockReturnValue({ data: [] });
  });

  it('leaves every field editable in a writable namespace', () => {
    render(<SecretForm mode={SecretFormMode.CREATE} />);

    for (const placeholder of [
      NAME_FIELD,
      VALUE_FIELD,
      DESCRIPTION_FIELD,
      ALIAS_FIELD,
      LABEL_FIELD,
    ]) {
      expect(field(placeholder)).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('disables every field in a read-only namespace', () => {
    mockUseNamespace.mockReturnValue({ namespace: 'default', readOnlyMode: true });

    render(<SecretForm mode={SecretFormMode.CREATE} />);

    for (const placeholder of [
      NAME_FIELD,
      VALUE_FIELD,
      DESCRIPTION_FIELD,
      ALIAS_FIELD,
      LABEL_FIELD,
    ]) {
      expect(field(placeholder)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('uses the secret-specific alias placeholder, not the field default', () => {
    render(<SecretForm mode={SecretFormMode.CREATE} />);

    expect(field(ALIAS_FIELD)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search aliases')).not.toBeInTheDocument();
  });

  it('requires a value when creating', async () => {
    const user = userEvent.setup();
    render(<SecretForm mode={SecretFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'api-key-production');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Value is required')).toBeInTheDocument();
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('creates a secret with description, alias and labels', async () => {
    const user = userEvent.setup();
    mockUseGetAllSecrets.mockReturnValue({
      data: [
        {
          id: '1',
          name: 'other-secret',
          description: null,
          alias: null,
          labels: [],
        },
      ],
    });

    render(<SecretForm mode={SecretFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'api-key-production');
    await user.type(field(VALUE_FIELD), 'super-secret-token');
    await user.type(field(DESCRIPTION_FIELD), 'Production API key');
    await user.type(field(ALIAS_FIELD), 'other-secret');
    await user.click(screen.getByText('other-secret'));
    await user.type(field(LABEL_FIELD), 'prod{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: 'api-key-production',
        string_data: { token: 'super-secret-token' },
        type: 'Opaque',
        description: 'Production API key',
        alias: 'other-secret',
        labels: ['prod'],
      });
    });
  });

  it('allows leaving the value blank when editing', async () => {
    const user = userEvent.setup();
    mockUseGetSecret.mockReturnValue({
      data: {
        id: '1',
        name: 'api-key-production',
        description: 'Production API key',
        alias: 'prod-key',
        labels: ['prod'],
      },
      isLoading: false,
    });

    render(
      <SecretForm mode={SecretFormMode.EDIT} secretName="api-key-production" />,
    );

    expect(field(NAME_FIELD)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        name: 'api-key-production',
        request: {
          string_data: undefined,
          description: 'Production API key',
          alias: 'prod-key',
          labels: ['prod'],
        },
      });
    });
  });

  it('rejects a description longer than 256 characters', async () => {
    const user = userEvent.setup();
    render(<SecretForm mode={SecretFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'api-key-production');
    await user.type(field(VALUE_FIELD), 'super-secret-token');
    await user.click(field(DESCRIPTION_FIELD));
    await user.paste('a'.repeat(257));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(
        screen.getByText('Description must be 256 characters or less'),
      ).toBeInTheDocument();
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });
});
