import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { LogsTab } from '@/components/sessions-conversations/logs-tab';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import { useGetEvents } from '@/lib/services/logs-hooks';
import { logsService } from '@/lib/services/logs';
import type { PaginatedSessions } from '@/lib/services/broker-sessions';
import type { LogsResponse } from '@/lib/services/logs';

vi.mock('@/lib/services/broker-sessions-hooks');
vi.mock('@/lib/services/logs-hooks');
vi.mock('@/lib/services/logs');
vi.mock('sonner');
vi.mock('@/components/sessions-conversations/session-table-row', () => ({
  SessionTableRow: ({ session }: any) => (
    <div data-testid={`session-row-${session.sessionId}`}>{session.name}</div>
  ),
}));
vi.mock('@/components/sessions-conversations/new-session-dialog', () => ({
  NewSessionDialog: () => null,
}));

describe('Pagination Edge Cases', () => {
  describe('SessionsTable', () => {
    const mockOnSelectSession = vi.fn();

    const mockSessionsData: PaginatedSessions = {
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

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(useListSessions).mockReturnValue({
        data: mockSessionsData,
        isLoading: false,
        isError: false,
        error: null,
      } as any);
    });

    it('should reset cursor when status filter changes', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      // Find the status select by its displayed value (second combobox after date range)
      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes[1]; // Second combobox is Status

      await user.click(statusSelect);
      await user.click(screen.getByText('Active'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.cursor).toBe(0);
        expect(lastCall.status).toBe('active');
      });
    });

    it('should reset cursor when sort changes', async () => {
      const user = userEvent.setup();

      // Start with cursor at 20
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
        />
      );

      // Click load more to advance cursor
      await user.click(screen.getByText('Load More'));

      // Change sort
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.cursor).toBe(0);
        expect(lastCall.sort).toBe('name');
      });
    });

    it('should not show load more button when hasMore is false', () => {
      vi.mocked(useListSessions).mockReturnValue({
        data: { ...mockSessionsData, hasMore: false },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });

    it('should handle missing nextCursor gracefully', async () => {
      const user = userEvent.setup();

      vi.mocked(useListSessions).mockReturnValue({
        data: { ...mockSessionsData, hasMore: true, nextCursor: undefined },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      await user.click(screen.getByText('Load More'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.cursor).toBe(0);
      });
    });

    it('should show correct count when total equals items length', () => {
      vi.mocked(useListSessions).mockReturnValue({
        data: {
          items: mockSessionsData.items,
          total: 1,
          hasMore: false,
        },
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
      expect(screen.getByText('Session 1')).toBeInTheDocument();
    });
  });

  describe('LogsTab', () => {
    const mockLogs: LogsResponse = {
      items: [
        {
          timestamp: '2024-01-01T00:00:00Z',
          eventType: 'QueryStart',
          reason: 'QueryStart',
          message: 'Query started',
          data: {
            queryId: 'q1',
            queryName: 'query-1',
            queryNamespace: 'default',
            sessionId: 'session-1',
          },
        },
        {
          timestamp: '2024-01-01T00:00:10Z',
          eventType: 'QueryComplete',
          reason: 'QueryComplete',
          message: 'Query completed',
          data: {
            queryId: 'q1',
            queryName: 'query-1',
            queryNamespace: 'default',
            sessionId: 'session-1',
          },
        },
      ],
      total: 102,
      hasMore: true,
      nextCursor: 100,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(useGetEvents).mockReturnValue({
        data: mockLogs,
        isLoading: false,
        error: null,
      } as any);
    });

    it('should append logs when loading more', async () => {
      const user = userEvent.setup();

      const additionalLogs: LogsResponse = {
        items: [
          {
            timestamp: '2024-01-01T00:00:20Z',
            eventType: 'QueryStart',
            reason: 'QueryStart',
            message: 'Another query started',
            data: {
              queryId: 'q2',
              queryName: 'query-2',
              queryNamespace: 'default',
              sessionId: 'session-1',
            },
          },
        ],
        total: 102,
        hasMore: false,
        nextCursor: undefined,
      };

      vi.mocked(logsService.getEvents).mockResolvedValueOnce(additionalLogs);

      render(<LogsTab sessionId="session-1" />);

      expect(screen.getByText('Query started')).toBeInTheDocument();
      expect(screen.getByText('Query completed')).toBeInTheDocument();

      await user.click(screen.getByText('Load more'));

      await waitFor(() => {
        expect(screen.getByText('Another query started')).toBeInTheDocument();
      });

      // All logs should be visible
      expect(screen.getByText('Query started')).toBeInTheDocument();
      expect(screen.getByText('Query completed')).toBeInTheDocument();
      expect(screen.getByText('Another query started')).toBeInTheDocument();
    });

    it('should update hasMore to false after loading last page', async () => {
      const user = userEvent.setup();

      const lastPageLogs: LogsResponse = {
        items: [
          {
            timestamp: '2024-01-01T00:00:20Z',
            eventType: 'QueryComplete',
            reason: 'QueryComplete',
            message: 'Final query',
            data: {
              queryId: 'q2',
              queryName: 'query-2',
              queryNamespace: 'default',
              sessionId: 'session-1',
            },
          },
        ],
        total: 103,
        hasMore: false,
        nextCursor: undefined,
      };

      vi.mocked(logsService.getEvents).mockResolvedValueOnce(lastPageLogs);

      render(<LogsTab sessionId="session-1" />);

      expect(screen.getByText('Load more')).toBeInTheDocument();

      await user.click(screen.getByText('Load more'));

      await waitFor(() => {
        expect(screen.queryByText('Load more')).not.toBeInTheDocument();
      });
    });

    it('should disable load more button while loading', async () => {
      const user = userEvent.setup();

      vi.mocked(logsService.getEvents).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockLogs), 100))
      );

      render(<LogsTab sessionId="session-1" />);

      const loadMoreButton = screen.getByText('Load more');
      await user.click(loadMoreButton);

      expect(screen.getByText('Loading...')).toBeDisabled();
    });

    it('should not allow load more when nextCursor is undefined', () => {
      vi.mocked(useGetEvents).mockReturnValue({
        data: { ...mockLogs, nextCursor: undefined, hasMore: false },
        isLoading: false,
        error: null,
      } as any);

      render(<LogsTab sessionId="session-1" />);

      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });

    it('should handle error during load more gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(logsService.getEvents).mockRejectedValueOnce(new Error('Network error'));

      render(<LogsTab sessionId="session-1" />);

      await user.click(screen.getByText('Load more'));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to load more events:',
          expect.any(Error)
        );
      });

      // Original logs should still be visible
      expect(screen.getByText('Query started')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('should prevent concurrent load more requests', async () => {
      const user = userEvent.setup();

      vi.mocked(logsService.getEvents).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockLogs), 50))
      );

      render(<LogsTab sessionId="session-1" />);

      const loadMoreButton = screen.getByText('Load more');

      // Try to click multiple times rapidly
      await user.click(loadMoreButton);
      await user.click(loadMoreButton);

      await waitFor(() => {
        expect(vi.mocked(logsService.getEvents)).toHaveBeenCalledTimes(1);
      });
    });

    it('should show empty state when no logs', () => {
      vi.mocked(useGetEvents).mockReturnValue({
        data: { items: [], total: 0, hasMore: false },
        isLoading: false,
        error: null,
      } as any);

      render(<LogsTab sessionId="session-1" />);

      expect(screen.getByText('No events found for this session')).toBeInTheDocument();
    });

    it('should use correct cursor when loading more', async () => {
      const user = userEvent.setup();

      vi.mocked(logsService.getEvents).mockResolvedValueOnce({
        items: [],
        total: 102,
        hasMore: false,
      });

      render(<LogsTab sessionId="session-1" />);

      await user.click(screen.getByText('Load more'));

      await waitFor(() => {
        expect(logsService.getEvents).toHaveBeenCalledWith('session-1', 100, 100);
      });
    });
  });
});
