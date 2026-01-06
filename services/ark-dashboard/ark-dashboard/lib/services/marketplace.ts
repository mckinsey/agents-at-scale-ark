import { apiClient } from '@/lib/api/client';
import type {
  InstallOptions,
  InstallResult,
  LocalItemCreate,
  LocalItemUpdate,
  MarketplaceFilters,
  MarketplaceItem,
  MarketplaceItemList,
  MarketplaceSource,
  MarketplaceSourceCreate,
  MarketplaceSourceList,
} from '@/lib/types/marketplace';

interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

export const marketplaceService = {
  async getSources(): Promise<MarketplaceSource[]> {
    const response = await apiClient.get<MarketplaceSourceList>(
      '/api/v1/marketplace/sources',
    );
    return response.sources;
  },

  async addSource(data: MarketplaceSourceCreate): Promise<MarketplaceSource> {
    return apiClient.post<MarketplaceSource>(
      '/api/v1/marketplace/sources',
      data,
    );
  },

  async removeSource(name: string): Promise<void> {
    await apiClient.delete(
      `/api/v1/marketplace/sources/${encodeURIComponent(name)}`,
    );
  },

  async getLocalItems(): Promise<MarketplaceItem[]> {
    const response = await apiClient.get<MarketplaceItemList>(
      '/api/v1/marketplace/local/items',
    );
    return response.items;
  },

  async createLocalItem(item: LocalItemCreate): Promise<MarketplaceItem> {
    return apiClient.post<MarketplaceItem>(
      '/api/v1/marketplace/local/items',
      item,
    );
  },

  async updateLocalItem(
    name: string,
    updates: LocalItemUpdate,
  ): Promise<MarketplaceItem | null> {
    try {
      return await apiClient.put<MarketplaceItem>(
        `/api/v1/marketplace/local/items/${encodeURIComponent(name)}`,
        updates,
      );
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async deleteLocalItem(name: string): Promise<boolean> {
    try {
      await apiClient.delete(
        `/api/v1/marketplace/local/items/${encodeURIComponent(name)}`,
      );
      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return false;
      }
      throw error;
    }
  },

  async exportLocalMarketplace(): Promise<Blob> {
    const response = await fetch('/api/v1/marketplace/local/export');
    if (!response.ok) {
      throw new Error('Failed to export marketplace');
    }
    return response.blob();
  },

  async getItems(filters?: MarketplaceFilters): Promise<MarketplaceItem[]> {
    const params: Record<string, string | boolean> = {};
    if (filters?.category) params.category = filters.category;
    if (filters?.type) params.type = filters.type;
    if (filters?.source) params.source = filters.source;
    if (filters?.search) params.search = filters.search;
    if (filters?.installed !== undefined) params.installed = filters.installed;

    const response = await apiClient.get<MarketplaceItemList>(
      '/api/v1/marketplace/items',
      { params },
    );
    return response.items;
  },

  async installItem(
    name: string,
    source: string,
    options: InstallOptions,
  ): Promise<InstallResult> {
    return apiClient.post<InstallResult>(
      `/api/v1/marketplace/items/${encodeURIComponent(name)}/install`,
      options,
      { params: { source } },
    );
  },
};
