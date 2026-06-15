import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from 'sonner';

import { APIError } from '@/lib/api/client';
import {
  useGetMarketplaceItemById,
  useGetMarketplaceItems,
  useUninstallMarketplaceItem,
} from '@/lib/services/marketplace-hooks';
import { marketplaceService } from '@/lib/services/marketplace';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/services/marketplace', () => ({
  marketplaceService: {
    getMarketplaceItems: vi.fn(),
    getMarketplaceItemById: vi.fn(),
    uninstallMarketplaceItem: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('marketplace hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetMarketplaceItems', () => {
    it('should fetch and return marketplace items', async () => {
      const mockResponse = {
        items: [
          { id: 'item-1', name: 'Test Item 1' },
          { id: 'item-2', name: 'Test Item 2' },
        ],
        total: 2,
      };

      vi.mocked(marketplaceService.getMarketplaceItems).mockResolvedValue(
        mockResponse as any,
      );

      const { result } = renderHook(() => useGetMarketplaceItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResponse);
      expect(marketplaceService.getMarketplaceItems).toHaveBeenCalledTimes(1);
    });

    it('should handle 4xx errors without retry', async () => {
      const error = new APIError('Bad request', 400);
      vi.mocked(marketplaceService.getMarketplaceItems).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useGetMarketplaceItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
      expect(marketplaceService.getMarketplaceItems).toHaveBeenCalledTimes(1);
    });
  });

  describe('useGetMarketplaceItemById', () => {
    it('should fetch and return a marketplace item', async () => {
      const mockItem = {
        id: 'test-item',
        name: 'Test Item',
        description: 'Test description',
      };

      vi.mocked(marketplaceService.getMarketplaceItemById).mockResolvedValue(
        mockItem as any,
      );

      const { result } = renderHook(() => useGetMarketplaceItemById('test-item'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockItem);
      expect(marketplaceService.getMarketplaceItemById).toHaveBeenCalledWith(
        'test-item',
      );
    });

    it('should not retry on 404 errors', async () => {
      const error = new APIError('Not found', 404);
      vi.mocked(marketplaceService.getMarketplaceItemById).mockRejectedValue(
        error,
      );

      const { result } = renderHook(
        () => useGetMarketplaceItemById('non-existent'),
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(marketplaceService.getMarketplaceItemById).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(error);
    });

    it('should not retry on 400 errors', async () => {
      const error = new APIError('Bad request', 400);
      vi.mocked(marketplaceService.getMarketplaceItemById).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useGetMarketplaceItemById('bad-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(marketplaceService.getMarketplaceItemById).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(error);
    });

    it('should not retry on 403 errors', async () => {
      const error = new APIError('Forbidden', 403);
      vi.mocked(marketplaceService.getMarketplaceItemById).mockRejectedValue(
        error,
      );

      const { result } = renderHook(
        () => useGetMarketplaceItemById('forbidden-item'),
        {
          wrapper: createWrapper(),
        },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(marketplaceService.getMarketplaceItemById).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(error);
    });
  });

  describe('useUninstallMarketplaceItem', () => {
    it('invalidates marketplace queries on success without a success toast', async () => {
      vi.mocked(marketplaceService.uninstallMarketplaceItem).mockResolvedValue({
        status: 'command',
        helmCommand: 'helm uninstall phoenix',
      } as any);
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
