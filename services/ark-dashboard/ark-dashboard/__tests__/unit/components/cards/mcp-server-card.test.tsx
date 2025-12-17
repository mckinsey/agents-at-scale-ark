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
  AvailabilityStatusBadge: vi.fn(({ status, eventsLink }) => (
    <a href={eventsLink} data-testid="availability-badge">
      Status: {status || 'Unknown'}
    </a>
  )),
}));

vi.mock('@/components/editors/mcp-editor', () => ({
  McpEditor: vi.fn(({ open }) =>
    open ? <div data-testid="mcp-editor">Editor</div> : null
  ),
}));

vi.mock('./base-card', () => ({
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
    available: 'True',
    address: 'http://test.example.com',
    transport: 'http',
    tool_count: 5,
  };

  it('should render server name', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.getByText('test-server')).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /delete mcp server/i })).toBeInTheDocument();
  });

  it('should not render delete button when onDelete not provided', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    expect(screen.queryByRole('button', { name: /delete mcp server/i })).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /delete mcp server/i }));

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

    await userEvent.click(screen.getByRole('button', { name: /delete mcp server/i }));
    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('test-server');
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

    expect(screen.getByRole('button', { name: /view mcp server details/i })).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /view mcp server details/i }));

    expect(onInfo).toHaveBeenCalledWith(mockMcpServer);
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

    expect(screen.getByRole('button', { name: /edit mcp server details/i })).toBeInTheDocument();
  });

  it('should open editor when edit button clicked', async () => {
    const onUpdate = vi.fn();
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
        onUpdate={onUpdate}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /edit mcp server details/i }));

    expect(screen.getByTestId('mcp-editor')).toBeInTheDocument();
  });

  it('should render availability badge with events link', () => {
    render(
      <McpServerCard
        mcpServer={mockMcpServer}
        namespace="default"
      />
    );

    const link = screen.getByTestId('availability-badge');
    expect(link).toHaveAttribute('href', '/events?kind=MCPServer&name=test-server&page=1');
  });

  describe('Availability Status: Unknown', () => {
    it('should show address not available and no status message', () => {
      const unknownServer: MCPServer = {
        ...mockMcpServer,
        available: 'Unknown',
        address: undefined,
        status_message: undefined,
      };

      render(
        <McpServerCard
          mcpServer={unknownServer}
          namespace="default"
        />
      );

      const badge = screen.getByTestId('availability-badge');
      expect(badge).toHaveTextContent('Status: Unknown');
      expect(screen.getByText(/Address not available/)).toBeInTheDocument();
      expect(screen.queryByText(/status_message/i)).not.toBeInTheDocument();
    });
  });

  describe('Availability Status: Unavailable', () => {
    it('should show correct address, correct transport, and status message', () => {
      const unavailableServer: MCPServer = {
        ...mockMcpServer,
        available: 'False',
        address: 'http://unavailable.example.com',
        transport: 'sse',
        status_message: 'Connection timeout',
      };

      render(
        <McpServerCard
          mcpServer={unavailableServer}
          namespace="default"
        />
      );

      const badge = screen.getByTestId('availability-badge');
      expect(badge).toHaveTextContent('Status: False');
      expect(screen.getByText(/http:\/\/unavailable\.example\.com/)).toBeInTheDocument();
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Transport: sse';
      })).toBeInTheDocument();
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });
  });

  describe('Availability Status: Available', () => {
    it('should show correct address, correct transport, correct amount of tools, and no status message', () => {
      const availableServer: MCPServer = {
        ...mockMcpServer,
        available: 'True',
        address: 'http://available.example.com',
        transport: 'http',
        tool_count: 10,
        status_message: undefined,
      };

      render(
        <McpServerCard
          mcpServer={availableServer}
          namespace="default"
        />
      );

      const badge = screen.getByTestId('availability-badge');
      expect(badge).toHaveTextContent('Status: True');
      expect(screen.getByText(/http:\/\/available\.example\.com/)).toBeInTheDocument();
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Transport: http';
      })).toBeInTheDocument();
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Tools: 10';
      })).toBeInTheDocument();
      expect(screen.queryByText(/status_message/i)).not.toBeInTheDocument();
    });
  });
});
