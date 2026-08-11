import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import {
  useCreateMarketplaceSource,
  useDeleteMarketplaceSource,
  useGetMarketplaceItemById,
  useGetMarketplaceItems,
  useInstallMarketplaceItem,
  useMarketplaceCanEdit,
  useMarketplaceSources,
  useUninstallMarketplaceItem,
} from '@/lib/services/marketplace-hooks';
import { marketplaceService } from '@/lib/services/marketplace';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'team-a', readOnlyMode: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/services/marketplace', () => ({
  marketplaceService: {
    getMarketplaceItems: vi.fn(),
    getMarketplaceItemById: vi.fn(),
    getMarketplaceSources: vi.fn(),
    getMarketplaceSourcePermissions: vi.fn(),
    createMarketplaceSource: vi.fn(),
    deleteMarketplaceSource: vi.fn(),
    installMarketplaceItem: vi.fn(),
    uninstallMarketplaceItem: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('marketplace query hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useGetMarketplaceItems fetches items for the active namespace', async () => {
    vi.mocked(marketplaceService.getMarketplaceItems).mockResolvedValueOnce({
      items: [{ id: 'item-1' }],
      total: 1,
      page: 1,
      pageSize: 1,
    } as never);
    const { result } = renderHook(() => useGetMarketplaceItems(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.getMarketplaceItems).toHaveBeenCalledWith('team-a', undefined);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('useGetMarketplaceItemById fetches by id when id is set', async () => {
    vi.mocked(marketplaceService.getMarketplaceItemById).mockResolvedValueOnce({ id: 'phoenix' } as never);
    const { result } = renderHook(() => useGetMarketplaceItemById('phoenix'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.getMarketplaceItemById).toHaveBeenCalledWith('phoenix', 'team-a');
  });

  it('useMarketplaceSources fetches the namespace source list', async () => {
    vi.mocked(marketplaceService.getMarketplaceSources).mockResolvedValueOnce([
      { name: 'a', url: 'https://a.test/marketplace.json' },
    ]);
    const { result } = renderHook(() => useMarketplaceSources(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.getMarketplaceSources).toHaveBeenCalledWith('team-a');
    expect(result.current.data).toHaveLength(1);
  });

  it('useMarketplaceCanEdit reads the permission probe', async () => {
    vi.mocked(marketplaceService.getMarketplaceSourcePermissions).mockResolvedValueOnce({ canEdit: false });
    const { result } = renderHook(() => useMarketplaceCanEdit(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.canEdit).toBe(false);
  });
});

describe('marketplace mutation hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useCreateMarketplaceSource calls the service and invalidates on success', async () => {
    vi.mocked(marketplaceService.createMarketplaceSource).mockResolvedValueOnce({
      name: 'x',
      url: 'https://x.test/marketplace.json',
    });
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { result } = renderHook(() => useCreateMarketplaceSource(), { wrapper: createWrapper() });

    result.current.mutate({ name: 'x', url: 'https://x.test/marketplace.json' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.createMarketplaceSource).toHaveBeenCalledWith('team-a', {
      name: 'x',
      url: 'https://x.test/marketplace.json',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['marketplace'] });
  });

  it('useCreateMarketplaceSource toasts on error', async () => {
    vi.mocked(marketplaceService.createMarketplaceSource).mockRejectedValueOnce(new Error('409'));
    const { result } = renderHook(() => useCreateMarketplaceSource(), { wrapper: createWrapper() });

    result.current.mutate({ name: 'x', url: 'https://x.test/marketplace.json' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });

  it('useDeleteMarketplaceSource deletes by name and invalidates', async () => {
    vi.mocked(marketplaceService.deleteMarketplaceSource).mockResolvedValueOnce(undefined);
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteMarketplaceSource(), { wrapper: createWrapper() });

    result.current.mutate('internal');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.deleteMarketplaceSource).toHaveBeenCalledWith('team-a', 'internal');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['marketplace'] });
  });

  it('useInstallMarketplaceItem invalidates on success and toasts on error', async () => {
    vi.mocked(marketplaceService.installMarketplaceItem).mockResolvedValueOnce({});
    const { result } = renderHook(() => useInstallMarketplaceItem(), { wrapper: createWrapper() });
    result.current.mutate('phoenix');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(marketplaceService.installMarketplaceItem).toHaveBeenCalledWith('phoenix', 'team-a');

    vi.mocked(marketplaceService.installMarketplaceItem).mockRejectedValueOnce(new Error('boom'));
    const { result: errResult } = renderHook(() => useInstallMarketplaceItem(), {
      wrapper: createWrapper(),
    });
    errResult.current.mutate('phoenix');
    await waitFor(() => expect(errResult.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });

  describe('useUninstallMarketplaceItem', () => {
    it('invalidates marketplace queries on success without a success toast', async () => {
      vi.mocked(marketplaceService.uninstallMarketplaceItem).mockResolvedValue({
        status: 'command',
        helmCommand: 'helm uninstall phoenix',
      });
      const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

      const { result } = renderHook(() => useUninstallMarketplaceItem(), {
        wrapper: createWrapper(),
      });
      result.current.mutate('phoenix');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['marketplace'] });
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows an error toast on failure', async () => {
      vi.mocked(marketplaceService.uninstallMarketplaceItem).mockRejectedValue(
        new Error('boom'),
      );

      const { result } = renderHook(() => useUninstallMarketplaceItem(), {
        wrapper: createWrapper(),
      });
      result.current.mutate('phoenix');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load uninstall command',
        expect.objectContaining({ description: 'boom' }),
      );
    });
  });
});
