import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueriesSection } from '@/components/sections/queries-section';
import { queriesService } from '@/lib/services/queries';
import { useListQueries } from '@/lib/services/queries-hooks';

let searchParamsStore = new URLSearchParams();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsStore,
}));

vi.mock('@/lib/services/queries-hooks', () => ({
  useListQueries: vi.fn(),
}));

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

function renderSection(props: {
  searchTerm?: string;
  onClearSearch?: () => void;
} = {}) {
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
      />
    </QueryClientProvider>,
  );
  return { ...rendered, ref };
}

describe('QueriesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsStore = new URLSearchParams();
  });

  it('shows loading indicator while the hook is loading', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      refetch: vi.fn(),
    } as any);

    renderSection();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the onboarding empty state when no queries and no search term', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    renderSection({ searchTerm: '' });

    expect(screen.getByText('No Queries Yet')).toBeInTheDocument();
    expect(screen.queryByText(/No queries match/)).not.toBeInTheDocument();
  });

  it('shows the no-match empty state and Clear search button when searching with no results', async () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const onClearSearch = vi.fn();
    renderSection({ searchTerm: 'missing', onClearSearch });

    expect(screen.getByText('No matching queries')).toBeInTheDocument();
    expect(screen.getByText(/missing/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('renders rows for returned queries', () => {
    vi.mocked(useListQueries).mockReturnValue({
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
    } as any);

    renderSection();

    expect(screen.getByText('q-1')).toBeInTheDocument();
    expect(screen.getByText('q-2')).toBeInTheDocument();
  });

  it('navigates to query detail when a row is clicked', async () => {
    vi.mocked(useListQueries).mockReturnValue({
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
    } as any);

    renderSection();

    await userEvent.click(screen.getByText('q-1'));
    expect(mockPush).toHaveBeenCalledWith('/query/q-1');
  });

  it('calls queriesService.delete and refetches when delete button is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(queriesService.delete).mockResolvedValueOnce(undefined);
    vi.mocked(useListQueries).mockReturnValue({
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
    } as any);

    renderSection();

    const deleteBtn = screen.getByTitle('Delete query');
    await userEvent.click(deleteBtn);

    expect(queriesService.delete).toHaveBeenCalledWith('q-1');
    expect(refetch).toHaveBeenCalled();
  });

  it('exposes openAddEditor via ref that navigates to /query/new', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    const { ref } = renderSection();

    ref.current?.openAddEditor();
    expect(mockPush).toHaveBeenCalledWith('/query/new');
  });
});
