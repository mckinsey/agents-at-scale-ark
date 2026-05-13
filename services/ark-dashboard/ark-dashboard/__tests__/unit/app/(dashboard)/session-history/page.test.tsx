import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionHistoryPage from '@/app/(dashboard)/session-history/page';

const mockPush = vi.fn();

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush }),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header">Page Header</div>,
}));

vi.mock('@/components/sessions-conversations/sessions-table', () => ({
  SessionsTable: ({
    onSelectSession,
  }: {
    onSelectSession: (id: string) => void;
  }) => (
    <div data-testid="sessions-table">
      <button
        data-testid="select-session-btn"
        onClick={() => onSelectSession('test-session-123')}
      >
        Select Session
      </button>
    </div>
  ),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('SessionHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page header and sessions table', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionHistoryPage />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('sessions-table')).toBeInTheDocument();
  });

  it('should use namespaced navigation when selecting a session', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionHistoryPage />
      </QueryClientProvider>,
    );

    const selectButton = screen.getByTestId('select-session-btn');
    selectButton.click();

    expect(mockPush).toHaveBeenCalledWith('/sessions/test-session-123');
  });

  it('should render the page title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionHistoryPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });
});
