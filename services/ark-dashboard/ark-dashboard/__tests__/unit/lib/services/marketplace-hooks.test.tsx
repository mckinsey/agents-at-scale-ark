import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useGetMarketplaceItems,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';
import { marketplaceService } from '@/lib/services/marketplace';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'team-a', readOnlyMode: false }),
}));

vi.mock('@/lib/services/marketplace', () => ({
  marketplaceService: {
    getMarketplaceItems: vi.fn(),
    getMarketplaceSources: vi.fn(),
    getMarketplaceSourcePermissions: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('marketplace hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useGetMarketplaceItems fetches items for the active namespace', async () => {
    vi.mocked(marketplaceService.getMarketplaceItems).mockResolvedValueOnce({
      items: [{ id: 'item-1' }],
      total: 1,
      page: 1,
      pageSize: 1,
    } as never);

    const { result } = renderHook(() => useGetMarketplaceItems(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.getMarketplaceItems).toHaveBeenCalledWith('team-a', undefined);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('useMarketplaceSources fetches the namespace source list', async () => {
    vi.mocked(marketplaceService.getMarketplaceSources).mockResolvedValueOnce([
      { name: 'a', url: 'https://a.test/marketplace.json' },
    ]);

    const { result } = renderHook(() => useMarketplaceSources(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.getMarketplaceSources).toHaveBeenCalledWith('team-a');
    expect(result.current.data).toHaveLength(1);
  });

  it('useMarketplaceCanEdit reads the permission probe', async () => {
    vi.mocked(marketplaceService.getMarketplaceSourcePermissions).mockResolvedValueOnce({
      canEdit: false,
    });

    const { result } = renderHook(() => useMarketplaceCanEdit(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.canEdit).toBe(false);
  });
});
