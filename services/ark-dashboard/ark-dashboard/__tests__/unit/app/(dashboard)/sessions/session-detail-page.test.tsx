import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionDetailPage from '@/app/(dashboard)/sessions/[session_id]/page';
import { APIError } from '@/lib/api/client';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { BrokerSession } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/broker-sessions-hooks');

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockUseParams = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/sessions/session-123',
  useSearchParams: () => mockUseSearchParams(),
}));

// Mock child components
vi.mock('@/components/sessions-conversations/conversations-tab', () => ({
  ConversationsTab: ({ sessionId }: any) => (
    <div data-testid="conversations-tab">{sessionId}</div>
  ),
}));
vi.mock('@/components/sessions-conversations/logs-tab', () => ({
  LogsTab: ({ sessionId }: any) => (
    <div data-testid="logs-tab">{sessionId}</div>
  ),
}));

describe('SessionDetailPage', () => {
  const mockSession: BrokerSession = {
    sessionId: 'session-123',
    name: 'Test Session',
    status: 'active',
    errorCount: 2,
    participants: [
      { id: 'p1', name: 'test-agent', type: 'agent' },
      { id: 'p2', name: 'test-team', type: 'team' },
    ],
    conversationCount: 5,
    createdAt: '2024-01-01T10:30:00Z',
    lastActivity: '2024-01-01T11:00:00Z',
  };

  const mockParams = { session_id: 'session-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue(mockParams);
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(useGetSession).mockReturnValue({
      data: mockSession,
      isLoading: false,
      isError: false,
    } as any);
  });

  it('should show loading skeleton while loading', () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);

    const { container } = render(<SessionDetailPage />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show error state when loading fails', async () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any);

    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load session details')).toBeInTheDocument();
    });
  });

  it('should display session information correctly', async () => {
    render(<SessionDetailPage />);

    await waitFor(() => {
      // Session ID appears in the header (may also appear in child components)
      expect(screen.getAllByText('session-123')[0]).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // conversationCount
      expect(screen.getByText('Targets')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  it('should display participants', async () => {
    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('test-agent')).toBeInTheDocument();
      expect(screen.getByText('test-team')).toBeInTheDocument();
    });
  });

  it('should render History tab by default', async () => {
    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('conversations-tab')).toBeInTheDocument();
    });
  });

  it('should switch to Logs tab when clicked', async () => {
    const user = userEvent.setup();

    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('conversations-tab')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Logs'));

    await waitFor(() => {
      expect(screen.getByTestId('logs-tab')).toBeInTheDocument();
    });
  });

  it('should show correct status badge colors', async () => {
    render(<SessionDetailPage />);

    await waitFor(() => {
      const badge = screen.getByText('active');
      // QBDS uses outline classes for status colors
      expect(badge).toHaveClass('outline-status-information');
    });
  });

  it('should show error status badge in red', async () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: { ...mockSession, status: 'error' },
      isLoading: false,
      isError: false,
    } as any);

    render(<SessionDetailPage />);

    await waitFor(() => {
      const badge = screen.getByText('error');
      // QBDS uses outline classes for status colors
      expect(badge).toHaveClass('outline-status-error');
    });
  });

  it('navigates back to the sessions list, stripping new-session params', async () => {
    const user = userEvent.setup();
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('participant=test-agent&type=agent&namespace=demo'),
    );

    render(<SessionDetailPage />);

    await user.click(screen.getByText('Back to all sessions'));

    expect(mockPush).toHaveBeenCalledWith('/sessions?namespace=demo');
  });

  it('should show not found when the session does not exist', () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new APIError('Session not found', 404),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetSession>);

    render(<SessionDetailPage />);

    expect(screen.getByText('Session not found')).toBeInTheDocument();
    expect(
      screen.queryByText('Failed to load session details'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  });

  it('should show not found when the session disappears after loading', () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: mockSession,
      isLoading: false,
      isError: true,
      error: new APIError('Session not found', 404),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetSession>);

    render(<SessionDetailPage />);

    expect(screen.getByText('Session not found')).toBeInTheDocument();
    expect(screen.queryByTestId('conversations-tab')).not.toBeInTheDocument();
  });

  it('should keep showing the session when a later poll fails for another reason', () => {
    vi.mocked(useGetSession).mockReturnValue({
      data: mockSession,
      isLoading: false,
      isError: true,
      error: new APIError('Internal Server Error', 500),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetSession>);

    render(<SessionDetailPage />);

    expect(screen.getByTestId('conversations-tab')).toBeInTheDocument();
    expect(
      screen.queryByText('Failed to load session details'),
    ).not.toBeInTheDocument();
  });

  it('should offer a retry when loading fails for a reason other than not found', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useGetSession).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new APIError('Internal Server Error', 500),
      refetch,
    } as unknown as ReturnType<typeof useGetSession>);

    render(<SessionDetailPage />);

    expect(
      screen.getByText('Failed to load session details'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
