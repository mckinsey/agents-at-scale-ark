import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QueriesPage from '@/app/(dashboard)/queries/page';
import { useListQueries } from '@/lib/services/queries-hooks';

const mockReplace = vi.fn();
const mockOpenAddEditor = vi.fn();
let searchParamsStore = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParamsStore,
}));

vi.mock('@/lib/services/queries-hooks', () => ({
  useListQueries: vi.fn(),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header">{actions}</div>
  ),
}));

vi.mock('@/components/sections/queries-section', () => {
  const React = require('react');
  return {
    QueriesSection: React.forwardRef(
      (
        props: { searchTerm: string; onClearSearch: () => void },
        ref: React.ForwardedRef<{ openAddEditor: () => void }>,
      ) => {
        if (ref && typeof ref === 'object') {
          (ref as React.MutableRefObject<{ openAddEditor: () => void }>).current = {
            openAddEditor: mockOpenAddEditor,
          };
        }
        return (
          <div data-testid="queries-section" data-search-term={props.searchTerm} />
        );
      },
    ),
  };
});

vi.mock('@/components/ui/pagination', () => ({
  Pagination: ({
    currentPage,
    totalPages,
    itemsPerPage,
  }: {
    currentPage: number;
    totalPages: number;
    itemsPerPage: number;
  }) => (
    <div
      data-testid="pagination"
      data-current-page={currentPage}
      data-total-pages={totalPages}
      data-items-per-page={itemsPerPage}
    />
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QueriesPage />
    </QueryClientProvider>,
  );
}

describe('QueriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsStore = new URLSearchParams();
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
      isLoading: false,
      isFetching: false,
      isError: false,
    } as any);
  });

  it('renders title with total count from data', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 42, page: 1, page_size: 25 },
    } as any);

    renderPage();

    expect(screen.getByText('Queries (42)')).toBeInTheDocument();
  });

  it('renders bare title when data is undefined', () => {
    vi.mocked(useListQueries).mockReturnValue({ data: undefined } as any);

    renderPage();

    expect(screen.getByText('Queries')).toBeInTheDocument();
  });

  it('calls useListQueries with params parsed from URL', () => {
    searchParamsStore = new URLSearchParams('page=3&pageSize=15&q=hello');

    renderPage();

    expect(useListQueries).toHaveBeenCalledWith({
      page: 3,
      pageSize: 15,
      search: 'hello',
    });
  });

  it('passes searchTerm to QueriesSection from URL ?q= param', () => {
    searchParamsStore = new URLSearchParams('q=foo');

    renderPage();

    expect(screen.getByTestId('queries-section')).toHaveAttribute(
      'data-search-term',
      'foo',
    );
  });

  it('hides pagination when total <= pageSize', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 10, page: 1, page_size: 25 },
    } as any);

    renderPage();

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when total > pageSize', () => {
    vi.mocked(useListQueries).mockReturnValue({
      data: { items: [], count: 0, total: 100, page: 1, page_size: 25 },
    } as any);

    renderPage();

    const pagination = screen.getByTestId('pagination');
    expect(pagination).toHaveAttribute('data-current-page', '1');
    expect(pagination).toHaveAttribute('data-total-pages', '10');
    expect(pagination).toHaveAttribute('data-items-per-page', '10');
  });

  it('has Create Query button in header that triggers section ref', async () => {
    renderPage();

    const btn = screen.getByRole('button', { name: /create query/i });
    await userEvent.click(btn);

    expect(mockOpenAddEditor).toHaveBeenCalledTimes(1);
  });

  it('renders search input with placeholder', () => {
    renderPage();

    const input = screen.getByPlaceholderText('Search query text...');
    expect(input).toBeInTheDocument();
  });

  it('seeds search input from URL ?q= param', () => {
    searchParamsStore = new URLSearchParams('q=bar');

    renderPage();

    const input = screen.getByPlaceholderText(
      'Search query text...',
    ) as HTMLInputElement;
    expect(input.value).toBe('bar');
  });

  it('does not call router.replace synchronously on search input change', () => {
    renderPage();

    const input = screen.getByPlaceholderText('Search query text...');
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('updates search input value on typing', () => {
    renderPage();

    const input = screen.getByPlaceholderText(
      'Search query text...',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xyz' } });

    expect(input.value).toBe('xyz');
  });
});
