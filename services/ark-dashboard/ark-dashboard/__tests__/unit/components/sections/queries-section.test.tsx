import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueriesSection } from '@/components/sections/queries-section';
import { queriesService } from '@/lib/services/queries';

vi.mock('@/lib/services/queries', () => ({
  queriesService: {
    delete: vi.fn(),
  },
}));

vi.mock('@/components/namespaced-link', () => {
  const React = require('react');
  return {
    NamespacedLink: React.forwardRef(
      (
        {
          href,
          children,
          ...props
        }: { href?: unknown; children?: React.ReactNode },
        ref: React.Ref<HTMLAnchorElement>,
      ) =>
        React.createElement(
          'a',
          { href: typeof href === 'string' ? href : '', ref, ...props },
          children,
        ),
    ),
  };
});

vi.mock('@/lib/utils/time', () => ({
  formatAge: () => '5m',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type QueryResultStub = {
  data: unknown;
  isLoading: boolean;
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
  return render(
    <QueryClientProvider client={queryClient}>
      <QueriesSection
        searchTerm={props.searchTerm ?? ''}
        onClearSearch={props.onClearSearch ?? vi.fn()}
        queryResult={props.queryResult as never}
      />
    </QueryClientProvider>,
  );
}

const twoQueries = {
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
};

describe('QueriesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading indicator while the hook is loading', () => {
    renderSection({
      queryResult: {
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the no-match empty state and Clear search button when searching with no results', async () => {
    const onClearSearch = vi.fn();
    renderSection({
      searchTerm: 'missing',
      onClearSearch,
      queryResult: {
        data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText(/No queries match/)).toBeInTheDocument();
    expect(screen.getByText(/missing/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('renders a row per query with a phase status label', () => {
    renderSection({
      queryResult: {
        data: twoQueries,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('q-1')).toBeInTheDocument();
    expect(screen.getByText('q-2')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders queued queries with the amber Queued badge', () => {
    const { container } = renderSection({
      queryResult: {
        data: {
          items: [twoQueries.items[0]],
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

    expect(screen.getByText('q-queued')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber-300')).not.toBeNull();
  });

  it('renders queued queries with the amber Queued badge', () => {
    const { container } = renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-queued',
              namespace: 'default',
              input: 'waiting for a slot',
              creationTimestamp: '2026-01-03T00:00:00Z',
              status: { phase: 'queued' },
            },
          ],
          count: 1,
          total: 1,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('q-1').closest('a')).toHaveAttribute(
      'href',
      '/query/q-1',
    );
  });

  it('links each row to its query detail page', () => {
    renderSection({
      queryResult: {
        data: {
          items: [twoQueries.items[0]],
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

    await userEvent.click(
      screen.getByRole('button', { name: /delete query/i }),
    );

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
