import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseNamespace = vi.fn(() => ({
  namespace: 'default',
  readOnlyMode: false,
}));

interface MockSecret {
  id: string;
  name: string;
  display_name?: string;
  scope?: 'shared' | 'personal';
  description: string | null;
  alias: string | null;
  labels: string[];
}

interface MockUser {
  name?: string | null;
  email?: string | null;
}

interface MockGetSecretResult {
  data: MockSecret | undefined;
  isLoading: boolean;
}

const mockCreateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUpdateMutate = vi.fn();
const mockUseUpdateSecretProps = vi.fn();
const mockUpdatePending = vi.fn(() => false);
const mockUseUser = vi.fn<() => { user?: MockUser | null }>(() => ({
  user: undefined,
}));
const mockUseGetSecret = vi.fn<() => MockGetSecretResult>(() => ({
  data: undefined,
  isLoading: false,
}));
const mockUseGetAllSecrets = vi.fn((..._args: unknown[]) => ({
  data: [] as MockSecret[],
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/secrets'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetSecret: () => mockUseGetSecret(),
  useGetAllSecrets: (...args: unknown[]) => mockUseGetAllSecrets(...args),
  useCreateSecret: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateSecret: (props?: unknown) => {
    mockUseUpdateSecretProps(props);
    return {
      mutateAsync: mockUpdateMutateAsync,
      mutate: mockUpdateMutate,
      isPending: mockUpdatePending(),
    };
  },
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
    mockUseUser.mockReturnValue({ user: undefined });
    mockUpdatePending.mockReturnValue(false);
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
        scope: 'shared',
      });
    });
  });

  it('allows leaving the value blank when editing', async () => {
    const user = userEvent.setup();
    mockUseGetSecret.mockReturnValue({
      data: {
        id: '1',
        name: 'api-key-production',
        display_name: 'api-key-production',
        scope: 'shared',
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

  describe('scope', () => {
    const PERSONAL_NAME = 'u-0123456789abcdef-github-pat';
    const personalSecret: MockSecret = {
      id: PERSONAL_NAME,
      name: PERSONAL_NAME,
      display_name: 'github-pat',
      scope: 'personal',
      description: 'My GitHub token',
      alias: 'gh',
      labels: ['mcp'],
    };
    const sharedSecret: MockSecret = {
      id: 'openai',
      name: 'openai',
      display_name: 'openai',
      scope: 'shared',
      description: null,
      alias: null,
      labels: [],
    };

    async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
      await user.type(field(NAME_FIELD), 'github-pat');
      await user.type(field(VALUE_FIELD), 'ghp_token');
    }

    it('suggests aliases from shared secrets only', () => {
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      expect(mockUseGetAllSecrets).toHaveBeenCalled();
      for (const args of mockUseGetAllSecrets.mock.calls) {
        expect(args).toEqual([]);
      }
    });

    it('offers no scope choice without a signed-in user and creates a shared secret', async () => {
      const user = userEvent.setup();
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('radio', { name: 'Personal' }),
      ).not.toBeInTheDocument();

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'github-pat', scope: 'shared' }),
        );
      });
    });

    it('lets a signed-in user choose the scope, defaulting to Shared', () => {
      mockUseUser.mockReturnValue({ user: { email: 'admin@ark.local' } });
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      expect(
        screen.getByRole('radiogroup', { name: 'Scope' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Shared' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Personal' })).not.toBeChecked();
      expect(
        screen.getByRole('radio', { name: 'Personal' }),
      ).toHaveAccessibleDescription(
        /used only in the MCP server overrides of a query/,
      );
    });

    it('creates a shared secret when a signed-in user keeps the default', async () => {
      const user = userEvent.setup();
      mockUseUser.mockReturnValue({ user: { email: 'admin@ark.local' } });
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ scope: 'shared' }),
        );
      });
    });

    it('sends the chosen Personal scope with the logical name', async () => {
      const user = userEvent.setup();
      mockUseUser.mockReturnValue({ user: { email: 'admin@ark.local' } });
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      await fillRequired(user);
      await user.click(screen.getByRole('radio', { name: 'Personal' }));
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => {
        expect(mockCreateMutateAsync).toHaveBeenCalledWith({
          name: 'github-pat',
          string_data: { token: 'ghp_token' },
          type: 'Opaque',
          description: null,
          alias: null,
          labels: [],
          scope: 'personal',
        });
      });
    });

    it('disables the scope choice in a read-only namespace', () => {
      mockUseUser.mockReturnValue({ user: { email: 'admin@ark.local' } });
      mockUseNamespace.mockReturnValue({
        namespace: 'default',
        readOnlyMode: true,
      });
      render(<SecretForm mode={SecretFormMode.CREATE} />);

      expect(screen.getByRole('radio', { name: 'Shared' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Personal' })).toBeDisabled();
    });

    it('shows the scope read-only when editing, with no choice', () => {
      mockUseUser.mockReturnValue({ user: { email: 'admin@ark.local' } });
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Scope' })).toHaveTextContent(
        'Personal',
      );
    });

    it('makes a personal secret shared after confirmation, sending its full state', async () => {
      const user = userEvent.setup();
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      await user.click(screen.getByRole('button', { name: 'Make shared' }));
      expect(mockUpdateMutate).not.toHaveBeenCalled();

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(
        `Everyone with access to this namespace will see "github-pat" in Ark and can use it in any resource. Its name stays "${PERSONAL_NAME}". A shared secret cannot be made personal again.`,
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Make shared' }),
      );

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        name: PERSONAL_NAME,
        request: {
          description: 'My GitHub token',
          alias: 'gh',
          labels: ['mcp'],
          scope: 'shared',
        },
      });
      expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      await user.click(screen.getByRole('button', { name: 'Make shared' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Cancel',
        }),
      );

      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('blocks Make shared while there are unsaved changes', async () => {
      const user = userEvent.setup();
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );
      expect(screen.getByRole('button', { name: 'Make shared' })).toBeEnabled();

      await user.type(field(DESCRIPTION_FIELD), ' edited');

      const button = screen.getByRole('button', { name: 'Make shared' });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(
        'Save or discard your changes before making it shared.',
      );
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('disables Make shared while an update is in flight', () => {
      mockUpdatePending.mockReturnValue(true);
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      expect(
        screen.getByRole('button', { name: 'Make shared' }),
      ).toBeDisabled();
    });

    it('stays on the page after making a secret shared and says so', () => {
      const onSuccess = vi.fn();
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm
          mode={SecretFormMode.EDIT}
          secretName={PERSONAL_NAME}
          onSuccess={onSuccess}
        />,
      );

      expect(mockUseUpdateSecretProps).toHaveBeenCalledWith({ onSuccess });
      expect(mockUseUpdateSecretProps).toHaveBeenCalledWith({
        successMessage: 'Secret is now shared',
      });
    });

    it('moves focus to the scope once the secret reloads as shared', () => {
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      const { rerender } = render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );
      mockUseGetSecret.mockReturnValue({
        data: { ...personalSecret, scope: 'shared' },
        isLoading: false,
      });
      rerender(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      const group = screen.getByRole('group', { name: 'Scope' });
      expect(group).toHaveTextContent('Shared');
      expect(group).toHaveFocus();
      expect(
        screen.queryByRole('button', { name: 'Make shared' }),
      ).not.toBeInTheDocument();
    });

    it('shows the display name in the breadcrumb of a personal secret', () => {
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      const current = document.querySelector('[aria-current="page"]');
      expect(current).toHaveTextContent(/^github-pat$/);
    });

    it('hides Make shared for a shared secret', () => {
      mockUseGetSecret.mockReturnValue({
        data: sharedSecret,
        isLoading: false,
      });

      render(<SecretForm mode={SecretFormMode.EDIT} secretName="openai" />);

      expect(screen.getByRole('group', { name: 'Scope' })).toHaveTextContent(
        'Shared',
      );
      expect(
        screen.queryByRole('button', { name: 'Make shared' }),
      ).not.toBeInTheDocument();
    });

    it('disables Make shared in a read-only namespace', () => {
      mockUseNamespace.mockReturnValue({
        namespace: 'default',
        readOnlyMode: true,
      });
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );

      expect(
        screen.getByRole('button', { name: 'Make shared' }),
      ).toBeDisabled();
    });

    it('does not send a scope when saving an edit', async () => {
      const user = userEvent.setup();
      mockUseGetSecret.mockReturnValue({
        data: personalSecret,
        isLoading: false,
      });

      render(
        <SecretForm mode={SecretFormMode.EDIT} secretName={PERSONAL_NAME} />,
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
      });
      expect(mockUpdateMutateAsync.mock.calls[0][0].request).not.toHaveProperty(
        'scope',
      );
    });
  });
});
