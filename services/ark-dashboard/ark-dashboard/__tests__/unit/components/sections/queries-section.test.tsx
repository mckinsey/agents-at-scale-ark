import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueriesSection } from '@/components/sections/queries-section';
import { queriesService } from '@/lib/services/queries';

vi.mock('@/lib/services/queries', () => ({
  queriesService: {
    cancel: vi.fn(),
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

  it('renders a queued query with the Queued badge', () => {
    renderSection({
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

    expect(screen.getByText('q-queued')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('cancels a running query when its Cancel action is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(queriesService.cancel).mockResolvedValueOnce({} as never);
    renderSection({
      queryResult: {
        data: {
          items: [
            {
              name: 'q-running',
              namespace: 'default',
              input: 'in progress',
              creationTimestamp: '2026-01-04T00:00:00Z',
              status: { phase: 'running' },
            },
          ],
          count: 1,
          total: 1,
          page: 1,
          page_size: 25,
        },
        isLoading: false,
        isError: false,
        refetch,
      },
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(queriesService.cancel).toHaveBeenCalledWith('q-running');
      expect(refetch).toHaveBeenCalled();
    });
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
        isError: false,
        refetch: vi.fn(),
      },
    });

    expect(screen.getByText('q-1').closest('a')).toHaveAttribute(
      'href',
      '/query/q-1',
    );
  });

  it('calls queriesService.delete and refetches when delete is clicked', async () => {
    const refetch = vi.fn();
    vi.mocked(queriesService.delete).mockResolvedValueOnce(undefined);
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
});
