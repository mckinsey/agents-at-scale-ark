import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseNamespace = vi.fn(() => ({
  namespace: 'default',
  readOnlyMode: false,
}));

interface MockConfiguration {
  id: string;
  name: string;
  value: string;
  description: string | null;
  alias: string | null;
  labels: string[];
}

interface MockGetConfigurationResult {
  data: MockConfiguration | undefined;
  isLoading: boolean;
}

const mockCreateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockUseGetConfiguration = vi.fn<() => MockGetConfigurationResult>(() => ({
  data: undefined,
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/configurations'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetConfiguration: () => mockUseGetConfiguration(),
  useCreateConfiguration: () => ({
    mutateAsync: mockCreateMutateAsync,
    isPending: false,
  }),
  useUpdateConfiguration: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

import { ConfigurationForm } from '@/components/forms/configuration-form/configuration-form';
import { ConfigurationFormMode } from '@/components/forms/configuration-form/types';

const field = (name: string) => screen.getByPlaceholderText(name);

const NAME_FIELD = 'e.g., github-mcp-url';
const VALUE_FIELD = 'e.g., https://api.githubcopilot.com/mcp/';
const DESCRIPTION_FIELD = 'e.g., GitHub remote MCP endpoint';
const ALIAS_FIELD = 'e.g., github-mcp';
const LABEL_FIELD = 'Type a label and press Enter';

describe('ConfigurationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNamespace.mockReturnValue({
      namespace: 'default',
      readOnlyMode: false,
    });
    mockUseGetConfiguration.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it('leaves every field editable in a writable namespace', () => {
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

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

  it('disables every field in a read-only namespace, not just the submit button', () => {
    mockUseNamespace.mockReturnValue({
      namespace: 'default',
      readOnlyMode: true,
    });

    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

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

  it('sends labels under the labels key when creating', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'github-mcp-url');
    await user.type(field(VALUE_FIELD), 'https://example.test/mcp/');
    await user.type(field(LABEL_FIELD), 'mcp{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: 'github-mcp-url',
        value: 'https://example.test/mcp/',
        description: null,
        alias: null,
        labels: ['mcp'],
      });
    });
  });

  it('refuses to create while a typed label is still invalid', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'github-mcp-url');
    await user.type(field(VALUE_FIELD), 'https://example.test/mcp/');
    await user.type(field(LABEL_FIELD), 'mcp servers');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(
        screen.getByText(/starting and ending with a letter or digit/i),
      ).toBeInTheDocument();
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
    expect(field(LABEL_FIELD)).toHaveValue('mcp servers');
  });

  it('flags an invalid label on Enter, before the user reaches Create', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(LABEL_FIELD), 'mcp servers{Enter}');

    await waitFor(() => {
      expect(
        screen.getByText(/starting and ending with a letter or digit/i),
      ).toBeInTheDocument();
    });
  });

  it('refuses to create while a typed label duplicates an existing one', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'github-mcp-url');
    await user.type(field(VALUE_FIELD), 'https://example.test/mcp/');
    await user.type(field(LABEL_FIELD), 'mcp{Enter}');
    await user.type(field(LABEL_FIELD), 'mcp');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText(/already been added/i)).toBeInTheDocument();
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it('creates once the invalid label is corrected', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'github-mcp-url');
    await user.type(field(VALUE_FIELD), 'https://example.test/mcp/');
    await user.type(field(LABEL_FIELD), 'mcp servers');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(
        screen.getByText(/starting and ending with a letter or digit/i),
      ).toBeInTheDocument();
    });

    await user.clear(field(LABEL_FIELD));
    await user.type(field(LABEL_FIELD), 'mcp-servers');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        name: 'github-mcp-url',
        value: 'https://example.test/mcp/',
        description: null,
        alias: null,
        labels: ['mcp-servers'],
      });
    });
  });

  it('locks the name field when editing an existing configuration', () => {
    mockUseGetConfiguration.mockReturnValue({
      data: {
        id: 'uuid-1234',
        name: 'github-mcp-url',
        value: 'https://example.test/mcp/',
        description: null,
        alias: null,
        labels: [],
      },
      isLoading: false,
    });

    render(
      <ConfigurationForm
        mode={ConfigurationFormMode.EDIT}
        configurationName="github-mcp-url"
      />,
    );

    expect(field(NAME_FIELD)).toBeDisabled();
    expect(field(VALUE_FIELD)).toBeEnabled();
  });

  it('rejects a description longer than 256 characters', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(field(NAME_FIELD), 'github-mcp-url');
    await user.type(field(VALUE_FIELD), 'https://example.test/mcp/');
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
