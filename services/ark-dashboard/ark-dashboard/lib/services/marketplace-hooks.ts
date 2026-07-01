'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  MarketplaceFilters,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';
import { useNamespace } from '@/providers/NamespaceProvider';
import { retryQueryHandler } from '@/lib/utils/query-retry';

import {
  marketplaceService,
  type MarketplacePermissions,
  type MarketplaceSourceEntry,
} from './marketplace';

export function useGetMarketplaceItems(filters?: MarketplaceFilters) {
  const { namespace } = useNamespace();
  return useQuery<MarketplaceResponse>({
    queryKey: ['marketplace', 'items', namespace, filters],
    queryFn: () => marketplaceService.getMarketplaceItems(namespace, filters),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
}

export function useGetMarketplaceItemById(id: string) {
  const { namespace } = useNamespace();
  return useQuery<MarketplaceItemDetail>({
    queryKey: ['marketplace', 'item', namespace, id],
    queryFn: () => marketplaceService.getMarketplaceItemById(id, namespace),
    enabled: Boolean(id && namespace),
    retry: retryQueryHandler,
  });
}

export function useMarketplaceSources() {
  const { namespace } = useNamespace();
  return useQuery<MarketplaceSourceEntry[]>({
    queryKey: ['marketplace', 'sources', namespace],
    queryFn: () => marketplaceService.getMarketplaceSources(namespace),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
}

export function useMarketplaceCanEdit() {
  const { namespace } = useNamespace();
  return useQuery<MarketplacePermissions>({
    queryKey: ['marketplace', 'permissions', namespace],
    queryFn: () => marketplaceService.getMarketplaceSourcePermissions(namespace),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
}

export function useCreateMarketplaceSource() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarketplaceSourceEntry) =>
      marketplaceService.createMarketplaceSource(namespace, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Failed to add marketplace source', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    },
  });
}

export function useDeleteMarketplaceSource() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      marketplaceService.deleteMarketplaceSource(namespace, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Failed to delete marketplace source', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    },
  });
}

export function useInstallMarketplaceItem() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceService.installMarketplaceItem(id, namespace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Installation failed', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    },
  });
}

export function useUninstallMarketplaceItem() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketplaceService.uninstallMarketplaceItem(id, namespace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: error => {
      toast.error('Failed to load uninstall command', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    },
  });
}
