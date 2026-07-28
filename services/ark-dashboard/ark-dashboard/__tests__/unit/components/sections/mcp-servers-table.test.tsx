import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpServersTable } from '@/components/sections/mcp-servers-table';
import type { MCPServer } from '@/lib/services/mcp-servers';
import { formatExpiry } from '@/lib/utils/mcp-auth';

let readOnly = false;

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: readOnly, namespace: 'default' }),
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

function renderTable(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

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
    renderTable(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders names, address, transport and tool count', () => {
    renderTable(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    expect(screen.getByText('server-one')).toBeInTheDocument();
    expect(screen.getByText('server-two')).toBeInTheDocument();
    expect(screen.getByText('https://a.example/v1')).toBeInTheDocument();
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders an em dash for missing address, transport, tools and expires', () => {
    renderTable(<McpServersTable servers={[servers[1]]} onDelete={vi.fn()} />);
    // server-two has no address, transport or tool_count, and no MCP
    // authorization, so its Expires cell is a dash too.
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('falls back to availability status when there is no authorization', () => {
    const withUnknown = [
      ...servers,
      {
        id: 'server-three',
        name: 'server-three',
        namespace: 'default',
      } as MCPServer,
    ];
    renderTable(<McpServersTable servers={withUnknown} onDelete={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('maps authorization state to Authorized / Unauthenticated / Error', () => {
    const authServers = [
      {
        id: 'a',
        name: 'a',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'Authorized' },
      } as MCPServer,
      {
        id: 'r',
        name: 'r',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'Required' },
      } as MCPServer,
      {
        id: 'd',
        name: 'd',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'DiscoveryFailed' },
      } as MCPServer,
    ];
    renderTable(<McpServersTable servers={authServers} onDelete={vi.fn()} />);
    expect(screen.getByText('Authorized')).toBeInTheDocument();
    expect(screen.getByText('Unauthenticated')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders the token expiry for an authorized server', () => {
    const expiresAt = '2999-01-01T00:00:00Z';
    const authorized = [
      {
        id: 'a',
        name: 'a',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'Authorized', expiresAt },
      } as MCPServer,
    ];
    renderTable(<McpServersTable servers={authorized} onDelete={vi.fn()} />);
    expect(screen.getByText(formatExpiry(expiresAt))).toBeInTheDocument();
  });

  it('links each row name to its update page', () => {
    renderTable(<McpServersTable servers={servers} onDelete={vi.fn()} />);
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
    renderTable(<McpServersTable servers={servers} onDelete={onDelete} />);
    await user.click(screen.getAllByLabelText('MCP server actions')[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('server-one');
  });

  it('shows Authenticate in the menu when authorization is required', async () => {
    const user = userEvent.setup();
    const required = [
      {
        id: 'r',
        name: 'r',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'Required' },
      } as MCPServer,
    ];
    renderTable(<McpServersTable servers={required} onDelete={vi.fn()} />);
    await user.click(screen.getByLabelText('MCP server actions'));
    expect(
      screen.getByRole('menuitem', { name: 'Authenticate' }),
    ).toBeInTheDocument();
  });

  it('shows Re-authenticate and Sign out when authorized', async () => {
    const user = userEvent.setup();
    const authorized = [
      {
        id: 'a',
        name: 'a',
        namespace: 'default',
        available: 'True',
        authorization: { state: 'Authorized' },
      } as MCPServer,
    ];
    renderTable(<McpServersTable servers={authorized} onDelete={vi.fn()} />);
    await user.click(screen.getByLabelText('MCP server actions'));
    expect(
      screen.getByRole('menuitem', { name: 'Re-authenticate' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  it('disables the actions menu in read-only mode', () => {
    readOnly = true;
    renderTable(<McpServersTable servers={servers} onDelete={vi.fn()} />);
    for (const button of screen.getAllByLabelText('MCP server actions')) {
      expect(button).toBeDisabled();
    }
  });
});
