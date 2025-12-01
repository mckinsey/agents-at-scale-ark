import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpServerCard } from '@/components/cards/mcp-server-card';
import type { MCPServer } from '@/lib/services/mcp-servers';

vi.mock('@/lib/utils/icon-resolver', () => ({
  getCustomIcon: vi.fn(() => () => <div>IconMock</div>),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: vi.fn(({ open, title, onConfirm, confirmText }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <div>{title}</div>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/ui/availability-status-badge', () => ({
  AvailabilityStatusBadge: vi.fn(({ status, eventsLink }) => {
    const content = (
      <span data-testid="availability-badge-content">
        Status: {status}
      </span>
    );
    
    if (eventsLink) {
      return (
        <a href={eventsLink} data-testid="availability-badge">
          {content}
        </a>
      );
    }
    
    return <div data-testid="availability-badge">{content}</div>;
  }),
}));

vi.mock('@/components/editors/mcp-editor', () => ({
  McpEditor: vi.fn(() => <div data-testid="mcp-editor" />),
}));

vi.mock('@/components/cards/base-card', () => ({
  BaseCard: vi.fn(({ title, actions, footer }) => (
    <div data-testid="base-card">
      <div>{title}</div>
      {actions.map((action: { label: string; onClick: () => void }, idx: number) => (
        <button key={idx} onClick={action.onClick} aria-label={action.label}>
          {action.label}
        </button>
      ))}
      {footer}
    </div>
  )),
}));

describe('McpServerCard', () => {
  const mockMcpServer: MCPServer = {
    id: 'test-id',
    name: 'test-server',
    namespace: 'default',
    ready: true,
    address: 'http://test.example.com',
    transport: 'http',
    tool_count: 5,
  };

  it('should render server name and address', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.getByText('test-server')).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/test\.example\.com/)).toBeInTheDocument();
  });

  it('should render transport information', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.getByText(/Transport:/)).toBeInTheDocument();
    const transportElements = screen.getAllByText(/http/);
    expect(transportElements.length).toBeGreaterThan(0);
  });

  it('should render tool count when available', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.getByText(/Tools:/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('should not render tool count when not available', () => {
    const serverWithoutToolCount = { ...mockMcpServer, tool_count: undefined };
    render(
      <McpServerCard
        mcpServer={serverWithoutToolCount}
        namespace="default"
      />
    );

    expect(screen.queryByText(/Tools:/)).not.toBeInTheDocument();
  });

  it('should render delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('should not render delete button when onDelete not provided', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('should show confirmation dialog on delete click', async () => {
    const onDelete = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete MCP Server')).toBeInTheDocument();
  });

  it('should call onDelete with correct name when confirmed', async () => {
    const onDelete = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('test-server');
  });

  it('should render availability badge with correct status for ready server', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: True');
  });

  it('should render availability badge with correct status for not ready server', () => {
    const notReadyServer = { ...mockMcpServer, ready: false };
    render(
      <McpServerCard
        mcpServer={notReadyServer}
        namespace="default"
      />
    );

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: False');
  });

  it('should render availability badge with correct status for discovering server', () => {
    const discoveringServer = { ...mockMcpServer, ready: false, discovering: true };
    render(
      <McpServerCard
        mcpServer={discoveringServer}
        namespace="default"
      />
    );

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: Unknown');
  });

  it('should render availability badge with events link filtered by MCPServer kind and name', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    const link = screen.getByTestId('availability-badge');
    expect(link).toHaveAttribute('href', '/events?kind=MCPServer&name=test-server&page=1');
  });

  it('should render events link with correct parameters for different server name', () => {
    const serverWithDifferentName = { ...mockMcpServer, name: 'my-mcp-server' };
    render(
      <McpServerCard
        mcpServer={serverWithDifferentName}
        namespace="default"
      />
    );

    const link = screen.getByTestId('availability-badge');
    expect(link).toHaveAttribute('href', '/events?kind=MCPServer&name=my-mcp-server&page=1');
  });

  it('should render edit button when onUpdate provided', () => {
    const onUpdate = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('should not render edit button when onUpdate not provided', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('should render info button when onInfo provided', () => {
    const onInfo = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onInfo={onInfo}
      />
    );

    expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
  });

  it('should call onInfo when info button clicked', async () => {
    const onInfo = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onInfo={onInfo}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(onInfo).toHaveBeenCalledWith(mockMcpServer);
  });

  it('should display status message when present', () => {
    const serverWithMessage = {
      ...mockMcpServer,
      status_message: 'Connection error',
    };
    render(
      <McpServerCard
        mcpServer={serverWithMessage}
        namespace="default"
      />
    );

    expect(screen.getByText('Connection error')).toBeInTheDocument();
  });

  it('should display fallback address when address not available', () => {
    const serverWithoutAddress = {
      ...mockMcpServer,
      address: undefined,
    };
    render(
      <McpServerCard
        mcpServer={serverWithoutAddress}
        namespace="default"
      />
    );

    expect(screen.getByText(/Address not available/)).toBeInTheDocument();
  });

  it('should display fallback transport when transport not available', () => {
    const serverWithoutTransport = {
      ...mockMcpServer,
      transport: undefined,
    };
    render(
      <McpServerCard
        mcpServer={serverWithoutTransport}
        namespace="default"
      />
    );

    expect(screen.getByText(/unknown/)).toBeInTheDocument();
  });
});
