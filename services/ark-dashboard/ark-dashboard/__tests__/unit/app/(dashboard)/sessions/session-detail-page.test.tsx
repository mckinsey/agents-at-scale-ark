import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionDetailPage from '@/app/(dashboard)/sessions/[session_id]/page';
import { useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { BrokerSession } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/broker-sessions-hooks');

const mockPush = vi.fn();
const mockUseParams = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({ push: mockPush }),
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
      // Use heading role to get the session ID from the header (not from mocked child component)
      expect(screen.getByRole('heading', { name: 'session-123' })).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // conversationCount
      expect(screen.getByText('Participants')).toBeInTheDocument();
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
      expect(badge).toHaveClass('border-blue-500');
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
      expect(badge).toHaveClass('border-red-500');
    });
  });
});
