import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import type { PaginatedSessions } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/broker-sessions-hooks');
vi.mock('sonner');
vi.mock('@/components/sessions-conversations/session-table-row', () => ({
  SessionTableRow: ({ session }: any) => (
    <div data-testid={`session-row-${session.sessionId}`}>{session.name}</div>
  ),
}));
vi.mock('@/components/sessions-conversations/new-session-dialog', () => ({
  NewSessionDialog: () => null,
}));

describe('Filter Combination Scenarios', () => {
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

  describe('Status Filter', () => {
    it('should send undefined when status is "all"', () => {
      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      expect(useListSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
        })
      );
    });

    it('should send specific status value when selected', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes[1];

      await user.click(statusSelect);
      await user.click(screen.getByText('Active'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.status).toBe('active');
      });
    });

    it('should send error status correctly', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes[1];

      await user.click(statusSelect);
      await user.click(screen.getByText('Error'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.status).toBe('error');
      });
    });
  });

  describe('Date Range Filter', () => {
    it('should send undefined when date range is "all"', () => {
      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      expect(useListSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: undefined,
        })
      );
    });

    it('should calculate dateFrom for 24h range', async () => {
      const user = userEvent.setup();
      const now = Date.now();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      const dateSelect = comboboxes[0];

      await user.click(dateSelect);
      await user.click(screen.getByText('Last 24h'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        const dateFrom = new Date(lastCall.dateFrom).getTime();
        const expected = now - 24 * 60 * 60 * 1000;

        // Allow 1 second tolerance for test execution time
        expect(Math.abs(dateFrom - expected)).toBeLessThan(1000);
      });
    });

    it('should calculate dateFrom for 7d range', async () => {
      const user = userEvent.setup();
      const now = Date.now();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      const dateSelect = comboboxes[0];

      await user.click(dateSelect);
      await user.click(screen.getByText('Last 7 days'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        const dateFrom = new Date(lastCall.dateFrom).getTime();
        const expected = now - 7 * 24 * 60 * 60 * 1000;

        expect(Math.abs(dateFrom - expected)).toBeLessThan(1000);
      });
    });

    it('should calculate dateFrom for 30d range', async () => {
      const user = userEvent.setup();
      const now = Date.now();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      const comboboxes = screen.getAllByRole('combobox');
      const dateSelect = comboboxes[0];

      await user.click(dateSelect);
      await user.click(screen.getByText('Last 30 days'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        const dateFrom = new Date(lastCall.dateFrom).getTime();
        const expected = now - 30 * 24 * 60 * 60 * 1000;

        expect(Math.abs(dateFrom - expected)).toBeLessThan(1000);
      });
    });
  });

  describe('Search Filter', () => {
    it('should send undefined when search is empty', () => {
      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      expect(useListSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          search: undefined,
        })
      );
    });

    it('should render search input', () => {
      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      // Search input should be present and empty initially
      const searchInput = screen.getByPlaceholderText('Search');
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Multiple Filters Combined', () => {
    it('should apply status and sort together', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      // Apply status filter
      const comboboxes = screen.getAllByRole('combobox');
      await user.click(comboboxes[1]);
      await user.click(screen.getByText('Idle'));

      // Wait for status filter to apply
      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        expect(calls[calls.length - 1][0].status).toBe('idle');
      });

      // Apply sort
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];

        expect(lastCall.status).toBe('idle');
        expect(lastCall.sort).toBe('name');
        expect(lastCall.order).toBe('desc');
      });
    });
  });

  describe('Sort Interactions', () => {
    it('should switch sort field and reset to desc', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      // Default is date desc
      expect(useListSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'date',
          order: 'desc',
        })
      );

      // Switch to name (should default to desc)
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.sort).toBe('name');
        expect(lastCall.order).toBe('desc');
      });
    });

    it('should toggle order on same field', async () => {
      const user = userEvent.setup();

      render(
        <SessionsTable
          onSelectSession={mockOnSelectSession}
          selectedSessionId={null}
        />
      );

      // Click Name once (desc)
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        expect(calls[calls.length - 1][0].order).toBe('desc');
      });

      // Click Name again (asc)
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        expect(calls[calls.length - 1][0].order).toBe('asc');
      });

      // Click Name again (desc)
      await user.click(screen.getByText('Name'));

      await waitFor(() => {
        const calls = vi.mocked(useListSessions).mock.calls;
        expect(calls[calls.length - 1][0].order).toBe('desc');
      });
    });
  });
});
