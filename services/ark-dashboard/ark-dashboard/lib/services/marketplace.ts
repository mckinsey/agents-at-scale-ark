import { apiClient } from '@/lib/api/client';
import type {
  MarketplaceFilters,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';
import type { MarketplaceSource } from '@/lib/services/marketplace-fetcher';

// Get marketplace sources from localStorage
function getMarketplaceSources(): MarketplaceSource[] | undefined {
  if (typeof window === 'undefined') return undefined;

  const stored = localStorage.getItem('marketplace-sources');
  if (!stored) return undefined;

  try {
    return JSON.parse(stored);
  } catch {
    return undefined;
  }
}

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

    // Get sources and add to headers
    const sources = getMarketplaceSources();
    const headers: Record<string, string> = {};
    if (sources) {
      headers['X-Marketplace-Sources'] = JSON.stringify(sources);
    }

    return await apiClient.get<MarketplaceResponse>(url, { headers });
  },

  async getMarketplaceItemById(id: string): Promise<MarketplaceItemDetail> {
    return await apiClient.get<MarketplaceItemDetail>(`/api/marketplace/${id}`);
  },

  async installMarketplaceItem(id: string): Promise<unknown> {
    return await apiClient.post(`/api/marketplace/${id}/install`, {
      mode: 'command',
    });
  },

  async uninstallMarketplaceItem(id: string): Promise<void> {
    await apiClient.delete(`/api/marketplace/${id}/install`);
  },
};

export { marketplaceService };
