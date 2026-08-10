import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queriesService } from '@/lib/services/queries';
import { useGetQuery, useListQueries } from '@/lib/services/queries-hooks';

vi.mock('@/lib/services/queries', () => ({
  queriesService: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useListQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls queriesService.list with no params when none given', async () => {
    vi.mocked(queriesService.list).mockResolvedValue({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    } as any);

    const { result } = renderHook(() => useListQueries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queriesService.list).toHaveBeenCalledWith({});
  });

  it('passes pagination and search params through to the service', async () => {
    vi.mocked(queriesService.list).mockResolvedValue({
      items: [],
      count: 0,
      total: 0,
      page: 2,
      page_size: 15,
    } as any);

    const { result } = renderHook(
      () => useListQueries({ page: 2, pageSize: 15, search: 'hello' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queriesService.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 15,
      search: 'hello',
    });
  });

  it('returns the data from the service', async () => {
    const mockResponse = {
      items: [{ name: 'q-1', namespace: 'default', input: 'hi' }],
      count: 1,
      total: 42,
      page: 1,
      page_size: 25,
    };
    vi.mocked(queriesService.list).mockResolvedValue(mockResponse as any);

    const { result } = renderHook(() => useListQueries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
  });

  it('surfaces errors from the service', async () => {
    const error = new Error('Network error');
    vi.mocked(queriesService.list).mockRejectedValue(error);

    const { result } = renderHook(() => useListQueries(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(error);
  });

  it('creates distinct cache entries per params combination', async () => {
    vi.mocked(queriesService.list).mockResolvedValue({
      items: [],
      count: 0,
      total: 0,
      page: 1,
      page_size: 25,
    } as any);

    const wrapper = createWrapper();

    const { result: r1 } = renderHook(
      () => useListQueries({ page: 1 }),
      { wrapper },
    );
    const { result: r2 } = renderHook(
      () => useListQueries({ page: 2 }),
      { wrapper },
    );

    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    expect(queriesService.list).toHaveBeenCalledTimes(2);
    expect(queriesService.list).toHaveBeenNthCalledWith(1, { page: 1 });
    expect(queriesService.list).toHaveBeenNthCalledWith(2, { page: 2 });
  });
});

describe('useGetQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a query by name and returns the data', async () => {
    const mockQuery = { name: 'q-1', namespace: 'default', status: { phase: 'done' } };
    vi.mocked(queriesService.get).mockResolvedValue(mockQuery as any);

    const { result } = renderHook(() => useGetQuery('q-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queriesService.get).toHaveBeenCalledWith('q-1');
    expect(result.current.data).toEqual(mockQuery);
  });

  it('does not fetch when query name is null', () => {
    const { result } = renderHook(() => useGetQuery(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(queriesService.get).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', () => {
    const { result } = renderHook(() => useGetQuery('q-1', false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(queriesService.get).not.toHaveBeenCalled();
  });

  it('surfaces errors from the service', async () => {
    vi.mocked(queriesService.get).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useGetQuery('q-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
