import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigurationsTable } from '@/components/sections/configurations-table';
import type { ConfigurationDetailResponse } from '@/lib/services/configurations';

let readOnly = false;

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: readOnly, namespace: 'default' }),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    description,
    confirmText,
    onConfirm,
  }: {
    open: boolean;
    description: string;
    confirmText: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <p>{description}</p>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

const configurations: ConfigurationDetailResponse[] = [
  {
    id: 'mcp-url-prod',
    name: 'mcp-url-prod',
    description: 'MCP base url',
    alias: 'mcp-url',
    value: 'https://mcp.example.com/sse',
    labels: ['prod', 'eu', 'v2', 'beta'],
  },
  {
    id: 'model-timeout',
    name: 'model-timeout',
    value: '30',
    labels: [],
  },
];

describe('ConfigurationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnly = false;
  });

  it('renders the table headers', () => {
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Alias' }),
    ).not.toBeInTheDocument();
  });

  it('shows the name with the alias underneath', () => {
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('mcp-url-prod')).toBeInTheDocument();
    expect(screen.getByText('Alias: mcp-url')).toBeInTheDocument();
  });

  it('renders the value in its own column', () => {
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('https://mcp.example.com/sse')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('falls back to the name when there is no alias', () => {
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('model-timeout')).toBeInTheDocument();
  });

  it('renders label chips with an overflow count', () => {
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('prod')).toBeInTheDocument();
    expect(screen.getByText('eu')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('calls onEdit with the configuration', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Edit configuration' })[0],
    );

    expect(onEdit).toHaveBeenCalledWith(configurations[0]);
  });

  it('confirms before deleting and reports the displayed name', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getAllByRole('button', { name: 'Delete configuration' })[0],
    );

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Do you want to delete "mcp-url-prod" configuration? This action cannot be undone.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('mcp-url-prod');
  });

  it('disables the row actions in read-only mode', () => {
    readOnly = true;
    render(
      <ConfigurationsTable
        configurations={configurations}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole('button', { name: 'Edit configuration' })[0],
    ).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: 'Delete configuration' })[0],
    ).toBeDisabled();
  });
});
