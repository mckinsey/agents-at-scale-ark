import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionsPage from '@/app/(dashboard)/sessions/page';

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

vi.mock('@/components/sessions-conversations/new-session-dialog', () => ({
  NewSessionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-session-dialog">Dialog</div> : null,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page header and sessions table', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('sessions-table')).toBeInTheDocument();
  });

  it('should use namespaced navigation when selecting a session', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId('select-session-btn'));

    expect(mockPush).toHaveBeenCalledWith('/sessions/test-session-123');
  });

  it('should render the page title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('should open the new session dialog when clicking New session', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    await user.click(screen.getByText('New session'));

    expect(screen.getByTestId('new-session-dialog')).toBeInTheDocument();
  });
});
