import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  InstallOptions,
  LocalItemCreate,
  LocalItemUpdate,
  MarketplaceFilters,
  MarketplaceSourceCreate,
} from '@/lib/types/marketplace';

import { marketplaceService } from './marketplace';

export const MARKETPLACE_SOURCES_QUERY_KEY = 'marketplace-sources';
export const MARKETPLACE_ITEMS_QUERY_KEY = 'marketplace-items';

export const useGetMarketplaceSources = () => {
  return useQuery({
    queryKey: [MARKETPLACE_SOURCES_QUERY_KEY],
    queryFn: marketplaceService.getSources,
  });
};

export const useAddMarketplaceSource = (props?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MarketplaceSourceCreate) =>
      marketplaceService.addSource(data),
    onSuccess: source => {
      toast.success('Marketplace Source Added', {
        description: `Successfully added ${source.name}`,
      });
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_SOURCES_QUERY_KEY],
      });
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
      });
      props?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to Add Source', {
        description: error.message,
      });
    },
  });
};

export const useRemoveMarketplaceSource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => marketplaceService.removeSource(name),
    onSuccess: () => {
      toast.success('Marketplace Source Removed');
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_SOURCES_QUERY_KEY],
      });
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to Remove Source', {
        description: error.message,
      });
    },
  });
};

export const useGetMarketplaceItems = (_filters?: MarketplaceFilters) => {
  return useQuery({
    queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
    queryFn: () => marketplaceService.getItems(),
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });
};

export const useCreateLocalItem = (props?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (item: LocalItemCreate) =>
      marketplaceService.createLocalItem(item),
    onSuccess: item => {
      toast.success('Item Added to Marketplace', {
        description: `Successfully added ${item.displayName}`,
      });
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
      });
      props?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Failed to Add Item', {
        description: error.message,
      });
    },
  });
};

export const useUpdateLocalItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      updates,
    }: {
      name: string;
      updates: LocalItemUpdate;
    }) => marketplaceService.updateLocalItem(name, updates),
    onSuccess: item => {
      toast.success('Item Updated', {
        description: `Successfully updated ${item?.displayName}`,
      });
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to Update Item', {
        description: error.message,
      });
    },
  });
};

export const useDeleteLocalItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => marketplaceService.deleteLocalItem(name),
    onSuccess: () => {
      toast.success('Item Removed from Marketplace');
      queryClient.invalidateQueries({
        queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to Remove Item', {
        description: error.message,
      });
    },
  });
};

export const useInstallMarketplaceItem = (props?: {
  onSuccess?: () => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      source,
      options,
    }: {
      name: string;
      source: string;
      options: InstallOptions;
    }) => marketplaceService.installItem(name, source, options),
    onSuccess: result => {
      if (result.status === 'installed') {
        toast.success('Installation Successful', {
          description: `${result.name} installed to ${result.namespace}`,
        });
        queryClient.invalidateQueries({
          queryKey: [MARKETPLACE_ITEMS_QUERY_KEY],
        });
        if (result.type === 'executor') {
          queryClient.invalidateQueries({ queryKey: ['execution-engines'] });
        } else if (result.type === 'service') {
          queryClient.invalidateQueries({ queryKey: ['ark-services'] });
        }
        props?.onSuccess?.();
      } else {
        toast.error('Installation Failed', {
          description: result.error || 'Unknown error',
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Installation Failed', {
        description: error.message,
      });
    },
  });
};
