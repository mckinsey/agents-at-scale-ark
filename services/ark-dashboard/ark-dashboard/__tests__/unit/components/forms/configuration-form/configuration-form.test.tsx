import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigurationDetailResponse } from '@/lib/services/configurations';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const mockReadOnly = { value: false };
const mockConfiguration: { value: ConfigurationDetailResponse | undefined } = {
  value: undefined,
};

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetAllConfigurations: () => ({
    data: [
      { id: 'mcp-url-prod', name: 'mcp-url-prod' },
      { id: 'mcp-url-dev', name: 'mcp-url-dev' },
    ],
    isLoading: false,
  }),
  useGetConfiguration: () => ({
    data: mockConfiguration.value,
    isLoading: false,
  }),
  useCreateConfiguration: () => ({
    mutate: createMutate,
    isPending: false,
  }),
  useUpdateConfiguration: () => ({
    mutate: updateMutate,
    isPending: false,
  }),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: mockReadOnly.value }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/forms/fields/alias-field', () => ({
  AliasField: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (next: string) => void;
    options: readonly string[];
  }) => (
    <input
      aria-label="Alias"
      data-options={options.join(',')}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/forms/fields/labels-field', () => ({
  LabelsField: ({
    value,
    onChange,
  }: {
    value: readonly string[];
    onChange: (next: string[]) => void;
  }) => (
    <input
      aria-label="Labels"
      value={value.join(',')}
      onChange={event =>
        onChange(event.target.value.split(',').filter(Boolean))
      }
    />
  ),
}));

import {
  ConfigurationForm,
  ConfigurationFormMode,
} from '@/components/forms/configuration-form';

describe('ConfigurationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
    mockConfiguration.value = undefined;
  });

  it('renders the create chrome with all fields', () => {
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    expect(screen.getByText('New configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create$/i })).toBeEnabled();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByLabelText('Labels')).toBeInTheDocument();
  });

  it('breadcrumb links back to the configurations list', () => {
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    expect(screen.getByRole('link', { name: 'Configurations' })).toHaveAttribute(
      'href',
      '/configurations',
    );
  });

  it('blocks submission and reports missing required fields', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByText('Value is required')).toBeInTheDocument();
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('submits the create payload', async () => {
    const user = userEvent.setup();
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    await user.type(
      screen.getByPlaceholderText('e.g., mcp-server-url'),
      'mcp-url-prod',
    );
    await user.type(
      screen.getByPlaceholderText('e.g., https://mcp.example.com'),
      'https://mcp.example.com',
    );
    await user.type(screen.getByLabelText('Alias'), 'mcp-url');
    await user.type(screen.getByLabelText('Labels'), 'prod');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        name: 'mcp-url-prod',
        value: 'https://mcp.example.com',
        description: null,
        alias: 'mcp-url',
        labels: ['prod'],
      });
    });
  });

  it('offers other configuration names as alias options', () => {
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    expect(screen.getByLabelText('Alias')).toHaveAttribute(
      'data-options',
      'mcp-url-dev,mcp-url-prod',
    );
  });

  it('disables the name field and submits an update in edit mode', async () => {
    const user = userEvent.setup();
    mockConfiguration.value = {
      id: 'mcp-url-prod',
      name: 'mcp-url-prod',
      description: 'MCP base url',
      alias: 'mcp-url',
      labels: ['prod'],
      value: 'https://mcp.example.com',
    };

    render(
      <ConfigurationForm
        mode={ConfigurationFormMode.EDIT}
        configurationName="mcp-url-prod"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Edit configuration' }),
    ).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText('e.g., mcp-server-url');
    await waitFor(() => expect(nameInput).toHaveValue('mcp-url-prod'));
    expect(nameInput).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledWith({
        name: 'mcp-url-prod',
        request: {
          value: 'https://mcp.example.com',
          description: 'MCP base url',
          alias: 'mcp-url',
          labels: ['prod'],
        },
      });
    });
  });

  it('excludes the edited configuration from the alias options', () => {
    mockConfiguration.value = {
      id: 'mcp-url-prod',
      name: 'mcp-url-prod',
      value: 'https://mcp.example.com',
    };

    render(
      <ConfigurationForm
        mode={ConfigurationFormMode.EDIT}
        configurationName="mcp-url-prod"
      />,
    );

    expect(screen.getByLabelText('Alias')).toHaveAttribute(
      'data-options',
      'mcp-url-dev',
    );
  });

  it('disables the submit button in read-only mode', () => {
    mockReadOnly.value = true;
    render(<ConfigurationForm mode={ConfigurationFormMode.CREATE} />);

    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });
});
