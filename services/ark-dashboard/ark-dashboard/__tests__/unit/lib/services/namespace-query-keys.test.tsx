import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The namespace is appended as the LAST element of every namespaced key. These
// tests pin the React Query v5 semantics that choice depends on: the existing
// invalidations name only the leading constant, and they must still reach the
// namespace-suffixed entries without being rewritten.
const LIST_KEY = 'get-all-widgets';

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

describe('namespaced query keys', () => {
  it('a prefix-keyed invalidation refetches a namespace-suffixed entry', async () => {
    const queryClient = newQueryClient();
    const queryFn = vi.fn().mockResolvedValue(['widget-1']);

    const { result } = renderHook(
      () => useQuery({ queryKey: [LIST_KEY, 'team-a'], queryFn }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(1);

    queryClient.invalidateQueries({ queryKey: [LIST_KEY] });

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });

  it('an invalidation scoped to one namespace does not touch another', async () => {
    const queryClient = newQueryClient();
    const teamAFn = vi.fn().mockResolvedValue(['a']);
    const teamBFn = vi.fn().mockResolvedValue(['b']);

    const { result } = renderHook(
      () => ({
        a: useQuery({ queryKey: [LIST_KEY, 'team-a'], queryFn: teamAFn }),
        b: useQuery({ queryKey: [LIST_KEY, 'team-b'], queryFn: teamBFn }),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.a.isSuccess).toBe(true);
      expect(result.current.b.isSuccess).toBe(true);
    });

    queryClient.invalidateQueries({ queryKey: [LIST_KEY, 'team-a'] });

    await waitFor(() => expect(teamAFn).toHaveBeenCalledTimes(2));
    expect(teamBFn).toHaveBeenCalledTimes(1);
  });

  it('two namespaces hold separate cache entries under the same constant', async () => {
    const queryClient = newQueryClient();

    const { result } = renderHook(
      () => ({
        a: useQuery({
          queryKey: [LIST_KEY, 'team-a'],
          queryFn: () => Promise.resolve(['from-a']),
        }),
        b: useQuery({
          queryKey: [LIST_KEY, 'team-b'],
          queryFn: () => Promise.resolve(['from-b']),
        }),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.a.isSuccess).toBe(true);
      expect(result.current.b.isSuccess).toBe(true);
    });

    expect(result.current.a.data).toEqual(['from-a']);
    expect(result.current.b.data).toEqual(['from-b']);
  });

  it('a key that carries an id keeps the namespace last so id-scoped invalidation still matches', async () => {
    const queryClient = newQueryClient();
    const detailFn = vi.fn().mockResolvedValue({ id: 'model-1' });

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['get-model-by-id', 'model-1', 'team-a'],
          queryFn: detailFn,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // models-hooks invalidates [GET_MODEL_BY_ID_QUERY_KEY, model.id] after an
    // update. Inserting the namespace before the id would break that match.
    queryClient.invalidateQueries({ queryKey: ['get-model-by-id', 'model-1'] });

    await waitFor(() => expect(detailFn).toHaveBeenCalledTimes(2));
  });
});
