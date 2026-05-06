import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewSessionDialog } from '@/components/sessions-conversations/new-session-dialog';
import { agentsService } from '@/lib/services/agents';
import { teamsService } from '@/lib/services/teams';
import { toolsService } from '@/lib/services/tools';

vi.mock('@/lib/services/agents');
vi.mock('@/lib/services/teams');
vi.mock('@/lib/services/tools');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/utils/uuid', () => ({
  generateUUID: () => 'test-uuid-123',
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithClient = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('NewSessionDialog', () => {
  const mockOnOpenChange = vi.fn();

  const mockAgents = [
    { name: 'agent-1', description: 'First agent' },
    { name: 'agent-2', description: 'Second agent' },
  ];

  const mockTeams = [
    { name: 'team-1', description: 'First team' },
  ];

  const mockTools = [
    { name: 'tool-1', description: 'First tool' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentsService.getAll).mockResolvedValue(mockAgents as any);
    vi.mocked(teamsService.getAll).mockResolvedValue(mockTeams as any);
    vi.mocked(toolsService.getAll).mockResolvedValue(mockTools as any);
  });

  it('should not render when closed', () => {
    renderWithClient(<NewSessionDialog open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create new session')).toBeInTheDocument();
    expect(screen.getByText('Select one participant to start a session')).toBeInTheDocument();
  });

  it('should display loading state initially', () => {
    // Create a fresh query client to avoid caching
    const freshQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.mocked(agentsService.getAll).mockReturnValue(new Promise(() => {})); // Never resolves
    vi.mocked(teamsService.getAll).mockReturnValue(new Promise(() => {}));
    vi.mocked(toolsService.getAll).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider client={freshQueryClient}>
        <NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Loading participants...')).toBeInTheDocument();
  });

  it('should display all participants when loaded', async () => {
    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
      expect(screen.getByText('agent-2')).toBeInTheDocument();
      expect(screen.getByText('team-1')).toBeInTheDocument();
      expect(screen.getByText('tool-1')).toBeInTheDocument();
    });
  });

  it('should filter participants by search query', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    await user.type(searchInput, 'agent-1');

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
      expect(screen.queryByText('agent-2')).not.toBeInTheDocument();
      expect(screen.queryByText('team-1')).not.toBeInTheDocument();
    });
  });

  it('should filter by tab (agents only)', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Agents'));

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
      expect(screen.getByText('agent-2')).toBeInTheDocument();
      expect(screen.queryByText('team-1')).not.toBeInTheDocument();
      expect(screen.queryByText('tool-1')).not.toBeInTheDocument();
    });
  });

  it('should enable Create button when participant selected', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create/i });
    expect(createButton).toBeDisabled();

    const radio = screen.getAllByRole('radio')[0];
    await user.click(radio);

    expect(createButton).not.toBeDisabled();
  });

  it('should show participant count when selected', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });

    expect(screen.getByText('0 participants selected')).toBeInTheDocument();

    const radio = screen.getAllByRole('radio')[0];
    await user.click(radio);

    expect(screen.getByText('1 participant selected')).toBeInTheDocument();
  });

  it('should close dialog on Cancel button', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await user.click(screen.getByText('Cancel'));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show no participants message when search has no results', async () => {
    const user = userEvent.setup();

    renderWithClient(<NewSessionDialog open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search');
    await user.type(searchInput, 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText('No participants found')).toBeInTheDocument();
    });
  });
});
