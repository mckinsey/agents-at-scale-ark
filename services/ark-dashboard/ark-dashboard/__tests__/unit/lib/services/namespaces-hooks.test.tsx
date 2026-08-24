import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { namespacesService } from '@/lib/services/namespaces';
import {
  GET_CONTEXT_QUERY_KEY,
  useGetContext,
} from '@/lib/services/namespaces-hooks';

vi.mock('@/lib/services/namespaces', () => ({
  namespacesService: {
    getContext: vi.fn(),
  },
}));

const contextFor = (namespace: string) => ({
  namespace,
  cluster: null,
  read_only_mode: false,
});

// Mirrors providers/QueryClientProvider.tsx, so the per-query staleTime is
// exercised against the same defaults the app runs with.
const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnMount: 'always',
        staleTime: 0,
      },
    },
  });

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('useGetContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds the resolved namespace key with the response already in hand', async () => {
    vi.mocked(namespacesService.getContext).mockResolvedValue(
      contextFor('tenant-a') as never,
    );
    const client = createClient();

    const { result } = renderHook(() => useGetContext(undefined), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => {
      expect(result.current.data?.namespace).toBe('tenant-a');
    });

    await waitFor(() => {
      expect(
        client.getQueryData([GET_CONTEXT_QUERY_KEY, 'tenant-a']),
      ).toMatchObject({ namespace: 'tenant-a' });
    });
  });

  it('serves the write-back key from cache instead of fetching again', async () => {
    vi.mocked(namespacesService.getContext).mockResolvedValue(
      contextFor('tenant-a') as never,
    );
    const client = createClient();

    const { result, rerender } = renderHook(
      ({ namespace }: { namespace?: string }) => useGetContext(namespace),
      {
        initialProps: { namespace: undefined as string | undefined },
        wrapper: wrapperFor(client),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.namespace).toBe('tenant-a');
    });

    // The provider has written ?namespace=tenant-a into the URL.
    rerender({ namespace: 'tenant-a' });

    expect(result.current.data?.namespace).toBe('tenant-a');
    expect(namespacesService.getContext).toHaveBeenCalledTimes(1);
  });

  it('fetches the context for a namespace the user switches to', async () => {
    vi.mocked(namespacesService.getContext).mockImplementation(
      (namespace?: string) =>
        Promise.resolve(contextFor(namespace ?? 'tenant-a') as never),
    );
    const client = createClient();

    const { result, rerender } = renderHook(
      ({ namespace }: { namespace?: string }) => useGetContext(namespace),
      {
        initialProps: { namespace: 'tenant-a' as string | undefined },
        wrapper: wrapperFor(client),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.namespace).toBe('tenant-a');
    });

    rerender({ namespace: 'tenant-b' });

    // Permissions and read-only mode differ per namespace, so a real switch has
    // to reach the API however the seeded entry is cached.
    await waitFor(() => {
      expect(result.current.data?.namespace).toBe('tenant-b');
    });
    expect(namespacesService.getContext).toHaveBeenCalledWith('tenant-b');
  });

  it('does not serve the previous namespace under a newly requested key', async () => {
    vi.mocked(namespacesService.getContext).mockImplementation(
      (namespace?: string) =>
        namespace === 'tenant-b'
          ? new Promise(() => {})
          : Promise.resolve(contextFor('tenant-a') as never),
    );
    const client = createClient();

    const { result, rerender } = renderHook(
      ({ namespace }: { namespace?: string }) => useGetContext(namespace),
      {
        initialProps: { namespace: 'tenant-a' as string | undefined },
        wrapper: wrapperFor(client),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.namespace).toBe('tenant-a');
    });

    rerender({ namespace: 'tenant-b' });

    // keepPreviousData would hand tenant-a's context back here, which is what
    // let the provider write tenant-a over a newly requested tenant-b.
    expect(result.current.data).toBeUndefined();
  });
});
