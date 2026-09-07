import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import QueriesPage from '@/app/(dashboard)/queries/page';
import { useListQueries } from '@/lib/services/queries-hooks';

const mockReplace = vi.fn();
const mockRefetch = vi.fn();
let searchParamsStore = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParamsStore,
}));

vi.mock('@/lib/services/queries-hooks', () => ({
  useListQueries: vi.fn(),
}));

vi.mock('@/components/sections/queries-section', () => ({
  QueriesSection: (props: { searchTerm: string }) => (
    <div data-testid="queries-section" data-search-term={props.searchTerm} />
  ),
}));

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

function mockQueries(overrides: Record<string, unknown> = {}) {
  vi.mocked(useListQueries).mockReturnValue({
    data: { items: [], count: 0, total: 5, page: 1, page_size: 25 },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
    ...overrides,
  } as unknown as ReturnType<typeof useListQueries>);
}

describe('QueriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsStore = new URLSearchParams();
    mockQueries();
  });

  it('renders the "Query logs" header and subtitle', () => {
    renderPage();

    expect(screen.getByText(/^Query logs/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Monitor query activity, execution time, status, and errors',
      ),
    ).toBeInTheDocument();
  });

  it('renders a Create query link to /query/new', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /create query/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/query/new'));
  });

  it('refetches when Refresh is clicked', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no queries and no search', () => {
    mockQueries({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
    });

    renderPage();

    expect(screen.getByText('No queries yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toBeInTheDocument();
    expect(screen.queryByTestId('queries-section')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Search query text...'),
    ).not.toBeInTheDocument();
  });

  it('does not show the empty state while a search is active', () => {
    searchParamsStore = new URLSearchParams('q=foo');
    mockQueries({
      data: { items: [], count: 0, total: 0, page: 1, page_size: 25 },
    });

    renderPage();

    expect(screen.queryByText('No queries yet')).not.toBeInTheDocument();
    expect(screen.getByTestId('queries-section')).toBeInTheDocument();
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
    mockQueries({
      data: { items: [], count: 0, total: 10, page: 1, page_size: 25 },
    });

    renderPage();

    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when total > pageSize', () => {
    mockQueries({
      data: { items: [], count: 0, total: 100, page: 1, page_size: 25 },
    });

    renderPage();

    const pagination = screen.getByTestId('pagination');
    expect(pagination).toHaveAttribute('data-current-page', '1');
    expect(pagination).toHaveAttribute('data-total-pages', '10');
    expect(pagination).toHaveAttribute('data-items-per-page', '10');
  });

  it('renders the search input when there are queries', () => {
    renderPage();

    expect(
      screen.getByPlaceholderText('Search query text...'),
    ).toBeInTheDocument();
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
