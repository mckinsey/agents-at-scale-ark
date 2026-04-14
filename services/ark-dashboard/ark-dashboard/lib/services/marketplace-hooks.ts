'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  MarketplaceFilters,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';

import { marketplaceService } from './marketplace';

export function useGetMarketplaceItems(filters?: MarketplaceFilters) {
  return useQuery<MarketplaceResponse>({
    queryKey: ['marketplace', filters],
    queryFn: () => marketplaceService.getMarketplaceItems(filters),
  });
}

export function useGetMarketplaceItemById(id: string) {
  return useQuery<MarketplaceItemDetail>({
    queryKey: ['marketplace', id],
    queryFn: () => marketplaceService.getMarketplaceItemById(id),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'status' in error) {
        const status = error.status as number | undefined;
        if (status && status >= 400 && status < 500) {
          return false;
        }
      }
      return failureCount < 3;
    },
  });
}

export function useInstallMarketplaceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => marketplaceService.installMarketplaceItem(id),
    onSuccess: () => {
      // Don't show a success toast since we're just showing commands
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Installation failed', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    },
  });
}

export function useUninstallMarketplaceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => marketplaceService.uninstallMarketplaceItem(id),
    onSuccess: (_, id) => {
      toast.success('Uninstallation started', {
        description: `Uninstalling marketplace item ${id}`,
      });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Uninstallation failed', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    },
  });
}
