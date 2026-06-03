import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpServersTable } from '@/components/sections/mcp-servers-table';
import type { MCPServer } from '@/lib/services/mcp-servers';

let readOnly = false;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: readOnly }),
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

const servers: MCPServer[] = [
  {
    id: 'server-one',
    name: 'server-one',
    namespace: 'default',
    address: 'https://a.example/v1',
    transport: 'http',
    tool_count: 5,
    available: 'True',
  } as MCPServer,
  {
    id: 'server-two',
    name: 'server-two',
    namespace: 'default',
    available: 'False',
  } as MCPServer,
];

describe('McpServersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnly = false;
  });

  it('renders the table headers', () => {
    render(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders names, address, transport and tool count', () => {
    render(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    expect(screen.getByText('server-one')).toBeInTheDocument();
    expect(screen.getByText('server-two')).toBeInTheDocument();
    expect(screen.getByText('https://a.example/v1')).toBeInTheDocument();
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders an em dash for missing address, transport and tools', () => {
    render(
      <McpServersTable servers={[servers[1]]} onDelete={vi.fn()} />,
    );
    // server-two has no address, transport or tool_count.
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders status labels for True / False / undefined', () => {
    const withUnknown = [
      ...servers,
      {
        id: 'server-three',
        name: 'server-three',
        namespace: 'default',
      } as MCPServer,
    ];
    render(<McpServersTable servers={withUnknown} onDelete={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('links each row name to its update page', () => {
    render(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'server-one' })).toHaveAttribute(
      'href',
      expect.stringContaining('/mcp/server-one/update'),
    );
    expect(screen.getByRole('link', { name: 'server-two' })).toHaveAttribute(
      'href',
      expect.stringContaining('/mcp/server-two/update'),
    );
  });

  it('opens confirmation dialog and calls onDelete on confirm', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<McpServersTable servers={servers} onDelete={onDelete} />);
    await user.click(screen.getAllByLabelText('Delete MCP server')[0]);
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('server-one');
  });

  it('disables delete buttons in read-only mode', () => {
    readOnly = true;
    render(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    for (const button of screen.getAllByLabelText('Delete MCP server')) {
      expect(button).toBeDisabled();
    }
  });
});
