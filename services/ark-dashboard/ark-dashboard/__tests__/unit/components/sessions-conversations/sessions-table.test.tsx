import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import type { PaginatedSessions } from '@/lib/services/broker-sessions';
import { toast } from 'sonner';

vi.mock('@/lib/services/broker-sessions-hooks');
vi.mock('sonner');
vi.mock('@/components/sessions-conversations/session-table-row', () => ({
  SessionTableRow: ({ session, isSelected, onSelect }: any) => (
    <div
      data-testid={`session-row-${session.sessionId}`}
      data-selected={isSelected}
      onClick={() => onSelect(session.sessionId)}
    >
      {session.name}
    </div>
  ),
}));
vi.mock('@/components/sessions-conversations/new-session-dialog', () => ({
  NewSessionDialog: ({ open }: any) => (
    open ? <div data-testid="new-session-dialog">Dialog</div> : null
  ),
}));

describe('SessionsTable', () => {
  const mockOnSelectSession = vi.fn();
  const mockOnSearchChange = vi.fn();

  const mockSessionsData: PaginatedSessions = {
    items: [
      {
        sessionId: 'session-1',
        name: 'Session 1',
        status: 'active',
        errorCount: 0,
        participants: [],
        conversationCount: 5,
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
      },
      {
        sessionId: 'session-2',
        name: 'Session 2',
        status: 'idle',
        errorCount: 0,
        participants: [],
        conversationCount: 3,
        createdAt: '2024-01-02T00:00:00Z',
        lastActivity: '2024-01-02T01:00:00Z',
      },
      {
        sessionId: 'session-3',
        name: 'Session 3',
        status: 'error',
        errorCount: 2,
        participants: [],
        conversationCount: 1,
        createdAt: '2024-01-03T00:00:00Z',
        lastActivity: '2024-01-03T01:00:00Z',
      },
    ],
    total: 3,
    hasMore: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListSessions).mockReturnValue({
      data: mockSessionsData,
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    vi.mocked(toast.error).mockImplementation(() => '');
  });

  it('should render sessions list', () => {
    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(screen.getByTestId('session-row-session-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-row-session-2')).toBeInTheDocument();
    expect(screen.getByTestId('session-row-session-3')).toBeInTheDocument();
  });

  it('should show statistics bar with counts', () => {
    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('errors')).toBeInTheDocument();
  });

  it('should show loading skeleton initially', () => {
    vi.mocked(useListSessions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    const { container } = render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no sessions', () => {
    vi.mocked(useListSessions).mockReturnValue({
      data: { items: [], total: 0, hasMore: false },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(screen.getByText('No sessions found')).toBeInTheDocument();
  });

  it('should handle session selection', async () => {
    const user = userEvent.setup();

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    await user.click(screen.getByTestId('session-row-session-1'));
    expect(mockOnSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('should mark selected session', () => {
    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId="session-2"
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(screen.getByTestId('session-row-session-2')).toHaveAttribute('data-selected', 'true');
  });

  it('should toggle sort on column click', async () => {
    const user = userEvent.setup();

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    const nameButton = screen.getByText('Name').closest('button');
    await user.click(nameButton!);

    await waitFor(() => {
      expect(useListSessions).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name', order: 'desc' })
      );
    });
  });

  it('should show load more button when hasMore', () => {
    vi.mocked(useListSessions).mockReturnValue({
      data: { ...mockSessionsData, hasMore: true, nextCursor: 20 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(screen.getByText('Load More')).toBeInTheDocument();
  });

  it('should handle load more click', async () => {
    const user = userEvent.setup();

    vi.mocked(useListSessions).mockReturnValue({
      data: { ...mockSessionsData, hasMore: true, nextCursor: 20 },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    await user.click(screen.getByText('Load More'));

    await waitFor(() => {
      const calls = vi.mocked(useListSessions).mock.calls;
      expect(calls[calls.length - 1][0].cursor).toBe(20);
    });
  });

  it('should show error toast', async () => {
    vi.mocked(useListSessions).mockReturnValue({
      data: mockSessionsData,
      isLoading: false,
      isError: true,
      error: new Error('Failed'),
    } as any);

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load sessions', {
        description: 'Failed',
      });
    });
  });

  it('should open new session dialog', async () => {
    const user = userEvent.setup();

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    await user.click(screen.getByText('New session'));

    await waitFor(() => {
      expect(screen.getByTestId('new-session-dialog')).toBeInTheDocument();
    });
  });

  it('should pass search query to input', () => {
    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery="test"
        onSearchChange={mockOnSearchChange}
      />
    );

    expect((screen.getByPlaceholderText('Search') as HTMLInputElement).value).toBe('test');
  });

  it('should call onSearchChange on input', async () => {
    const user = userEvent.setup();

    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    await user.type(screen.getByPlaceholderText('Search'), 'a');

    await waitFor(() => {
      expect(mockOnSearchChange).toHaveBeenCalled();
    });
  });

  it('should call useListSessions with correct params', () => {
    render(
      <SessionsTable
        onSelectSession={mockOnSelectSession}
        selectedSessionId={null}
        searchQuery=""
        onSearchChange={mockOnSearchChange}
      />
    );

    expect(useListSessions).toHaveBeenCalledWith({
      limit: 20,
      cursor: 0,
      status: undefined,
      dateFrom: undefined,
      search: undefined,
      sort: 'date',
      order: 'desc',
    });
  });
});
