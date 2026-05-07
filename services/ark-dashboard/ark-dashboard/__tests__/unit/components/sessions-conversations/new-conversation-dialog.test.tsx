import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewConversationDialog } from '@/components/sessions-conversations/new-conversation-dialog';
import { useParticipants } from '@/lib/services/participants-hooks';
import type { Participant as SessionParticipant } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/participants-hooks');

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

describe('NewConversationDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSelectParticipant = vi.fn();

  const sessionParticipants: SessionParticipant[] = [
    { id: 'p1', name: 'agent-1', type: 'agent' },
    { id: 'p2', name: 'team-1', type: 'team' },
  ];

  const allParticipants = [
    { name: 'agent-1', type: 'agent' as const, description: 'First agent' },
    { name: 'agent-2', type: 'agent' as const, description: 'Second agent' },
    { name: 'team-1', type: 'team' as const, description: 'First team' },
    { name: 'tool-1', type: 'tool' as const, description: 'First tool' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParticipants).mockReturnValue({
      data: allParticipants,
      isLoading: false,
    } as any);
  });

  it('should not render when closed', () => {
    renderWithClient(
      <NewConversationDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Start New Conversation')).toBeInTheDocument();
  });

  it('should display session participants section', () => {
    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.getByText(/In this session \(2\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('agent-1')).toHaveLength(2); // In both sections
    expect(screen.getAllByText('team-1')).toHaveLength(2); // In both sections
  });

  it('should display all participants section', () => {
    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.getByText(/All participants \(4\)/i)).toBeInTheDocument();
    // agent-2 and tool-1 only appear in "All participants", not in "In this session"
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getByText('tool-1')).toBeInTheDocument();
  });

  it('should filter participants by search query', async () => {
    const user = userEvent.setup();

    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search participants...');
    await user.type(searchInput, 'agent-2');

    await waitFor(() => {
      expect(screen.getByText('agent-2')).toBeInTheDocument();
      expect(screen.queryByText('team-1')).not.toBeInTheDocument();
      expect(screen.queryByText('tool-1')).not.toBeInTheDocument();
    });
  });

  it('should call onSelectParticipant when participant clicked', async () => {
    const user = userEvent.setup();

    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    const participantButtons = screen.getAllByRole('button');
    const agent1Button = participantButtons.find(btn =>
      btn.textContent?.includes('agent-1')
    );

    await user.click(agent1Button!);

    // Session participants have description: null when clicked from "In this session"
    expect(mockOnSelectParticipant).toHaveBeenCalledWith({
      name: 'agent-1',
      type: 'agent',
      description: null,
    });
  });

  it('should close dialog after selecting participant', async () => {
    const user = userEvent.setup();

    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    const participantButtons = screen.getAllByRole('button');
    const agent1Button = participantButtons.find(btn =>
      btn.textContent?.includes('agent-1')
    );

    await user.click(agent1Button!);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show no participants message when search has no results', async () => {
    const user = userEvent.setup();

    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search participants...');
    await user.type(searchInput, 'nonexistent-participant');

    await waitFor(() => {
      expect(screen.getByText('No participants found')).toBeInTheDocument();
    });
  });

  it('should display participant descriptions', () => {
    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={sessionParticipants}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.getByText('First agent')).toBeInTheDocument();
    expect(screen.getByText('Second agent')).toBeInTheDocument();
    expect(screen.getByText('First tool')).toBeInTheDocument();
  });

  it('should show empty participants when none provided', () => {
    vi.mocked(useParticipants).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    renderWithClient(
      <NewConversationDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionParticipants={[]}
        selectedConversation={null}
        onSelectParticipant={mockOnSelectParticipant}
      />
    );

    expect(screen.getByText('No participants found')).toBeInTheDocument();
  });
});
