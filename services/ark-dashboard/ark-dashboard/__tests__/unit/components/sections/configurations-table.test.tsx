import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigurationsTable } from '@/components/sections/configurations-table';
import type { Configuration } from '@/lib/services/configurations';

const onEdit = vi.fn();
const onDelete = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: false }),
}));

vi.mock('@/components/sections/configuration-delete-dialog', () => ({
  ConfigurationDeleteDialog: ({
    open,
    name,
    onConfirm,
  }: {
    open: boolean;
    name: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="delete-dialog">
        <button onClick={onConfirm}>Delete {name}</button>
      </div>
    ) : null,
}));

function configuration(overrides: Partial<Configuration> = {}): Configuration {
  return {
    id: 'uuid-1',
    name: 'github-mcp-url',
    value: 'https://example.test/mcp/',
    description: 'GitHub remote MCP endpoint',
    alias: null,
    tags: [],
    ...overrides,
  };
}

describe('ConfigurationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the name as the primary label', () => {
    render(
      <ConfigurationsTable
        configurations={[configuration()]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('github-mcp-url')).toBeInTheDocument();
  });

  it('shows the alias beneath the name when present', () => {
    render(
      <ConfigurationsTable
        configurations={[configuration({ alias: 'github-mcp' })]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Alias: github-mcp')).toBeInTheDocument();
  });

  it('omits the alias line when there is no alias', () => {
    render(
      <ConfigurationsTable
        configurations={[configuration()]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.queryByText(/^Alias:/)).not.toBeInTheDocument();
  });

  it('renders a dash for an empty description', () => {
    render(
      <ConfigurationsTable
        configurations={[configuration({ description: null })]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('collapses tags beyond the third into an overflow chip', () => {
    render(
      <ConfigurationsTable
        configurations={[
          configuration({ tags: ['a', 'b', 'c', 'd', 'e'] }),
        ]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onEdit with the configuration', async () => {
    const user = userEvent.setup();
    const target = configuration();
    render(
      <ConfigurationsTable
        configurations={[target]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByLabelText('Edit configuration'));

    expect(onEdit).toHaveBeenCalledWith(target);
  });

  it('calls onDelete with the name once the dialog confirms', async () => {
    const user = userEvent.setup();
    render(
      <ConfigurationsTable
        configurations={[configuration()]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByLabelText('Delete configuration'));
    await user.click(screen.getByText('Delete github-mcp-url'));

    expect(onDelete).toHaveBeenCalledWith('github-mcp-url');
  });
});
