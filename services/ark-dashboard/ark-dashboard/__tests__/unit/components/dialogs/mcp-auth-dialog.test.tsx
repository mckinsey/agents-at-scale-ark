import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpAuthDialog } from '@/components/dialogs/mcp-auth-dialog';
import { mcpServersService } from '@/lib/services/mcp-servers';

vi.mock('@/lib/services/mcp-servers', () => ({
  mcpServersService: {
    authStart: vi.fn(),
    authStatus: vi.fn(),
    authLogout: vi.fn(),
  },
}));

// Mock window.open
const mockWindowOpen = vi.fn();
global.window.open = mockWindowOpen;

describe('McpAuthDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mcpServerName = 'test-server';

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowOpen.mockReturnValue({ close: vi.fn(), closed: false });
  });

  it('should render initial state with authorize button', () => {
    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    expect(screen.getByText('Authorize MCP Server')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authorize/i })).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(
      <McpAuthDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    expect(screen.queryByText('Authorize MCP Server')).not.toBeInTheDocument();
  });

  it('should start auth flow when authorize button is clicked', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    expect(mcpServersService.authStart).toHaveBeenCalledWith(mcpServerName);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      mockAuthData.authorization_url,
      'mcp-oauth',
      'width=600,height=700,popup=yes'
    );
  });

  it('should show error when popup is blocked', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);
    mockWindowOpen.mockReturnValue(null);

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/failed to open authorization window/i)).toBeInTheDocument();
    });
  });

  it('should poll for status after starting auth', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);
    vi.mocked(mcpServersService.authStatus).mockResolvedValue({
      state: 'pending',
      message: null,
    });

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
        onSuccess={mockOnSuccess}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/complete authorization in the popup window/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mcpServersService.authStatus).toHaveBeenCalledWith(
        mcpServerName,
        mockAuthData.auth_id
      );
    });
  });

  it('should show success when auth completes', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);
    vi.mocked(mcpServersService.authStatus).mockResolvedValue({
      state: 'authorized',
      expires_at: '2024-12-31T23:59:59Z',
    });

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
        onSuccess={mockOnSuccess}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/authorization successful/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('should show error when auth fails', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);
    vi.mocked(mcpServersService.authStatus).mockResolvedValue({
      state: 'failed',
      message: 'User denied access',
    });

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/authorization failed/i)).toBeInTheDocument();
      expect(screen.getByText(/user denied access/i)).toBeInTheDocument();
    });
  });

  it('should show error when auth expires', async () => {
    const user = userEvent.setup();
    const mockAuthData = {
      auth_id: 'test-auth-id',
      authorization_url: 'https://oauth.example.com/authorize',
      flow_expires_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(mcpServersService.authStart).mockResolvedValue(mockAuthData);
    vi.mocked(mcpServersService.authStatus).mockResolvedValue({
      state: 'expired',
      message: 'Flow expired',
    });

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/authorization expired/i)).toBeInTheDocument();
    });
  });

  it('should handle auth start failure', async () => {
    const user = userEvent.setup();
    vi.mocked(mcpServersService.authStart).mockRejectedValue(
      new Error('Network error')
    );

    render(
      <McpAuthDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        mcpServerName={mcpServerName}
      />
    );

    const authorizeButton = screen.getByRole('button', { name: /authorize/i });
    await user.click(authorizeButton);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
