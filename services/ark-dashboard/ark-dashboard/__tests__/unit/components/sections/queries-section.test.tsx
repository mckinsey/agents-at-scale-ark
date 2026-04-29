import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueriesSection } from '@/components/sections/queries-section';
import { queriesService } from '@/lib/services/queries';

const mockPush = vi.fn();

vi.mock('@/lib/services/queries', () => ({
  queriesService: {
    cancel: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <a>{children}</a>
  ),
}));

vi.mock('@/lib/utils/events', () => ({
  getResourceEventsUrl: (kind: string, name: string) => `/events/${kind}/${name}`,
}));

vi.mock('@/lib/utils/time', () => ({
  formatAge: () => '5m',
}));

vi.mock('@/lib/constants', () => ({
  DASHBOARD_SECTIONS: {
    queries: { icon: () => <span data-testid="queries-icon" /> },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type QueryResultStub = {
  data: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
};

function renderSection(props: {
  searchTerm?: string;
  onClearSearch?: () => void;
  queryResult: QueryResultStub;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ref = createRef<{ openAddEditor: () => void }>();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <QueriesSection
        ref={ref}
        searchTerm={props.searchTerm ?? ''}
        onClearSearch={props.onClearSearch ?? vi.fn()}
        queryResult={props.queryResult as never}
      />
    </QueryClientProvider>,
  );
  return { ...rendered, ref };
}

describe('QueriesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading indicator while the hook is loading', () => {
    renderSection({
      queryResult: {
        data: undefined,
        isLoading: true,
        isFetching: true,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the onboarding empty state when no queries and no search term', () => {
    renderSection({
      searchTerm: '',
      queryResult: {
        data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('No Queries Yet')).toBeInTheDocument();
    expect(screen.queryByText(/No queries match/)).not.toBeInTheDocument();
  });

  it('shows the no-match empty state and Clear search button when searching with no results', async () => {
    const onClearSearch = vi.fn();
    renderSection({
      searchTerm: 'missing',
      onClearSearch,
      queryResult: {
        data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('No matching queries')).toBeInTheDocument();
    expect(screen.getByText(/missing/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('renders rows for returned queries', () => {
    renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-1',
              namespace: 'default',
              input: 'hello world',
              creationTimestamp: '2026-01-01T00:00:00Z',
              status: { phase: 'done' },
            },
            {
              name: 'q-2',
              namespace: 'default',
              input: 'another query',
              creationTimestamp: '2026-01-02T00:00:00Z',
              status: { phase: 'running' },
            },
          ],
          count: 2,
          total: 2,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('q-1')).toBeInTheDocument();
    expect(screen.getByText('q-2')).toBeInTheDocument();
  });

  it('navigates to query detail when a row is clicked', async () => {
    renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-1',
              namespace: 'default',
              input: 'hello',
              creationTimestamp: '2026-01-01T00:00:00Z',
              status: { phase: 'done' },
            },
          ],
          count: 1,
          total: 1,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    await userEvent.click(screen.getByText('q-1'));
    expect(mockPush).toHaveBeenCalledWith('/query/q-1');
  });

  it('calls queriesService.delete and refetches when delete button is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(queriesService.delete).mockResolvedValueOnce(undefined);
    renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-1',
              namespace: 'default',
              input: 'hello',
              creationTimestamp: '2026-01-01T00:00:00Z',
              status: { phase: 'done' },
            },
          ],
          count: 1,
          total: 1,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch,
      },
    });

    const deleteBtn = screen.getByTitle('Delete query');
    await userEvent.click(deleteBtn);

    expect(queriesService.delete).toHaveBeenCalledWith('q-1');
    expect(refetch).toHaveBeenCalled();
  });

  it('exposes openAddEditor via ref that navigates to /query/new', () => {
    const { ref } = renderSection({
      queryResult: {
        data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    ref.current?.openAddEditor();
    expect(mockPush).toHaveBeenCalledWith('/query/new');
  });

  it('does not propagate cancel click to the row', async () => {
    vi.mocked(queriesService.cancel).mockResolvedValueOnce({
      name: 'q-1',
      namespace: 'default',
      input: 'hello',
    } as never);
    renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-1',
              namespace: 'default',
              input: 'hello',
              creationTimestamp: '2026-01-01T00:00:00Z',
              status: { phase: 'running' },
            },
          ],
          count: 1,
          total: 1,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    await userEvent.click(screen.getByText('Cancel'));

    expect(queriesService.cancel).toHaveBeenCalledWith('q-1');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
