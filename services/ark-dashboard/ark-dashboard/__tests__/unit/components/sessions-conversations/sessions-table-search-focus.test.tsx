import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { brokerSessionsService } from '@/lib/services/broker-sessions';
import type { PaginatedSessions } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/broker-sessions', () => ({
  brokerSessionsService: {
    getSessions: vi.fn(),
  },
}));
vi.mock('@/components/ui/sonner');
vi.mock('@/components/sessions-conversations/session-table-row', () => ({
  SessionTableRow: ({
    session,
  }: {
    session: { sessionId: string; name: string };
  }) => (
    <div data-testid={`session-row-${session.sessionId}`}>{session.name}</div>
  ),
}));

const initialSessions: PaginatedSessions = {
  items: [
    {
      sessionId: 'session-1',
      name: 'Session 1',
      status: 'active',
      errorCount: 0,
      participants: [],
      conversationCount: 2,
      createdAt: '2024-01-01T00:00:00Z',
      lastActivity: '2024-01-01T01:00:00Z',
    },
  ],
  total: 1,
  hasMore: false,
};

const renderWithClient = (ui: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe('SessionsTable search focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the search input mounted and focused while a new search term is loading', async () => {
    vi.mocked(brokerSessionsService.getSessions).mockImplementation(params =>
      params?.search
        ? new Promise<PaginatedSessions>(() => {})
        : Promise.resolve(initialSessions),
    );

    const user = userEvent.setup();
    renderWithClient(
      <SessionsTable onSelectSession={vi.fn()} selectedSessionId={null} />,
    );

    const searchInput = await screen.findByPlaceholderText('Search');
    await user.click(searchInput);
    await user.type(searchInput, 'se');

    await waitFor(() =>
      expect(brokerSessionsService.getSessions).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'se' }),
      ),
    );

    expect(screen.getByPlaceholderText('Search')).toBe(searchInput);
    expect(document.activeElement).toBe(searchInput);

    await user.type(searchInput, 'ssion');

    expect(searchInput).toHaveValue('session');
    expect(document.activeElement).toBe(searchInput);
  });

  it('shows the skeleton on first load before any sessions arrive', () => {
    vi.mocked(brokerSessionsService.getSessions).mockReturnValue(
      new Promise<PaginatedSessions>(() => {}),
    );

    renderWithClient(
      <SessionsTable onSelectSession={vi.fn()} selectedSessionId={null} />,
    );

    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
  });
});
