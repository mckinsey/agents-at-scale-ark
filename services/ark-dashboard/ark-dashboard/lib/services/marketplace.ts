import { apiClient } from '@/lib/api/client';
import type {
  MarketplaceFilters,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';

const marketplaceService = {
  async getMarketplaceItems(
    filters?: MarketplaceFilters,
  ): Promise<MarketplaceResponse> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.featured !== undefined)
      params.append('featured', String(filters.featured));

    const queryString = params.toString();
    const url = queryString
      ? `/api/marketplace?${queryString}`
      : '/api/marketplace';

    return await apiClient.get<MarketplaceResponse>(url);
  },

  async getMarketplaceItemById(id: string): Promise<MarketplaceItemDetail> {
    return await apiClient.get<MarketplaceItemDetail>(`/api/marketplace/${id}`);
  },

  async installMarketplaceItem(id: string): Promise<void> {
    await apiClient.post(`/api/marketplace/${id}/install`);
  },

  async uninstallMarketplaceItem(id: string): Promise<void> {
    await apiClient.delete(`/api/marketplace/${id}/install`);
  },
};

export { marketplaceService };
