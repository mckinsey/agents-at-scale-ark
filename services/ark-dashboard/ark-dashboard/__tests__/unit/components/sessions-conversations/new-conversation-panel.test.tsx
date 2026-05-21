import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewConversationPanel } from '@/components/sessions-conversations/new-conversation-panel';
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

describe('NewConversationPanel', () => {
  const mockOnSelectParticipant = vi.fn();
  const mockOnCancel = vi.fn();

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

  it('renders search input and section headers', () => {
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByPlaceholderText('Search participants...')).toBeInTheDocument();
    expect(screen.getByText('In this session')).toBeInTheDocument();
    expect(screen.getByText('All participants')).toBeInTheDocument();
  });

  it('renders all participants from both lists', () => {
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    // In session: agent-1, team-1 — All: agent-1, agent-2, team-1, tool-1
    expect(screen.getAllByText('agent-1')).toHaveLength(2);
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getAllByText('team-1')).toHaveLength(2);
    expect(screen.getByText('tool-1')).toBeInTheDocument();
  });

  it('filters by search query across both sections', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    await user.type(screen.getByPlaceholderText('Search participants...'), 'tool');

    await waitFor(() => {
      expect(screen.queryByText('agent-1')).not.toBeInTheDocument();
      expect(screen.getByText('tool-1')).toBeInTheDocument();
    });
  });

  it('shows empty state when search has no matches', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    await user.type(screen.getByPlaceholderText('Search participants...'), 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText('No participants found')).toBeInTheDocument();
    });
  });

  it('calls onSelectParticipant when a participant is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByText('agent-2'));

    expect(mockOnSelectParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'agent-2', type: 'agent' })
    );
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <NewConversationPanel
        sessionParticipants={sessionParticipants}
        onSelectParticipant={mockOnSelectParticipant}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockOnCancel).toHaveBeenCalled();
  });
});
