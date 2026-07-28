import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolsTable } from '@/components/sections/tools-table';
import type { Tool } from '@/lib/services/tools';

const mockPush = vi.fn();

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: false }),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    onConfirm,
    confirmText,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmText: string;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

const tools: Tool[] = [
  { id: 't1', name: 'tool-one', description: 'First tool' } as Tool,
  { id: 't2', name: 'tool-two', type: 'mcp', description: '' } as Tool,
  { id: 't3', name: 'tool-three', type: 'agent', description: 'Third' } as Tool,
  { id: 't4', name: 'tool-four', type: 'team', description: 'Fourth' } as Tool,
];

const noUsage = {};

describe('ToolsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tool names and descriptions', () => {
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={vi.fn()} />);
    expect(screen.getByText('tool-one')).toBeInTheDocument();
    expect(screen.getByText('First tool')).toBeInTheDocument();
    expect(screen.getByText('tool-two')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('renders the type label for each tool type', () => {
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={vi.fn()} />);
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('MCP')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('renders a link to the tool detail for each row', () => {
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'tool-one' })).toHaveAttribute(
      'href',
      expect.stringContaining('/tools/tool-one'),
    );
    expect(screen.getByRole('link', { name: 'tool-two' })).toHaveAttribute(
      'href',
      expect.stringContaining('/tools/tool-two'),
    );
  });

  it('query button navigates to the query page targeting the tool', async () => {
    const user = userEvent.setup();
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={vi.fn()} />);
    await user.click(screen.getAllByLabelText('Query tool')[0]);
    expect(mockPush).toHaveBeenCalledWith(
      '/query/new?target_tool=tool-one',
    );
  });

  it('opens confirmation dialog and calls onDelete on confirm', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={onDelete} />);
    await user.click(screen.getAllByLabelText('Delete tool')[0]);
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });

  it('disables the delete button for a tool that is in use', () => {
    const usage = {
      'tool-one': { inUse: true, reason: 'Used by: agent-x' },
      'tool-two': { inUse: false },
    };
    render(<ToolsTable tools={tools} usage={usage} onDelete={vi.fn()} />);
    const deleteButtons = screen.getAllByLabelText('Delete tool');
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it('renders the table headers', () => {
    render(<ToolsTable tools={tools} usage={noUsage} onDelete={vi.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});
