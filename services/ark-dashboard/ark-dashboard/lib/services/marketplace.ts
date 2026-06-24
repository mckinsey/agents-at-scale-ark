import { apiClient } from '@/lib/api/client';
import type {
  MarketplaceFilters,
  MarketplaceItem,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';
import {
  buildItemsFromGroups,
  type MarketplaceItemsGroup,
} from '@/lib/services/marketplace-transform';

export interface MarketplaceSourceEntry {
  name: string;
  url: string;
  displayName?: string;
}

export interface MarketplacePermissions {
  canEdit: boolean;
}

function sourcesBase(namespace: string): string {
  return `/api/v1/namespaces/${encodeURIComponent(namespace)}/marketplace-sources`;
}

function applyFilters(
  items: MarketplaceItem[],
  filters?: MarketplaceFilters,
): MarketplaceItem[] {
  if (!filters) return items;
  let result = items;
  if (filters.category) result = result.filter(i => i.category === filters.category);
  if (filters.type) result = result.filter(i => i.type === filters.type);
  if (filters.status) result = result.filter(i => i.status === filters.status);
  if (filters.featured) result = result.filter(i => i.featured === true);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      i =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.tags.some(tag => tag.toLowerCase().includes(q)),
    );
  }
  return result;
}

const marketplaceService = {
  async getMarketplaceSources(namespace: string): Promise<MarketplaceSourceEntry[]> {
    return await apiClient.get<MarketplaceSourceEntry[]>(sourcesBase(namespace));
  },

  async createMarketplaceSource(
    namespace: string,
    body: MarketplaceSourceEntry,
  ): Promise<MarketplaceSourceEntry> {
    return await apiClient.post<MarketplaceSourceEntry>(sourcesBase(namespace), body);
  },

  async updateMarketplaceSource(
    namespace: string,
    name: string,
    body: Omit<MarketplaceSourceEntry, 'name'>,
  ): Promise<MarketplaceSourceEntry> {
    return await apiClient.patch<MarketplaceSourceEntry>(
      `${sourcesBase(namespace)}/${encodeURIComponent(name)}`,
      body,
    );
  },

  async deleteMarketplaceSource(namespace: string, name: string): Promise<void> {
    await apiClient.delete(`${sourcesBase(namespace)}/${encodeURIComponent(name)}`);
  },

  async getMarketplaceSourcePermissions(
    namespace: string,
  ): Promise<MarketplacePermissions> {
    return await apiClient.get<MarketplacePermissions>(
      `${sourcesBase(namespace)}/permissions`,
    );
  },

  async getMarketplaceItems(
    namespace: string,
    filters?: MarketplaceFilters,
  ): Promise<MarketplaceResponse> {
    const groups = await apiClient.get<MarketplaceItemsGroup[]>(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}/marketplace-items`,
    );
    const allItems = await buildItemsFromGroups(groups, namespace);
    const items = applyFilters(allItems, filters);
    return { items, total: items.length, page: 1, pageSize: items.length };
  },

  async getMarketplaceItemById(
    id: string,
    namespace: string,
  ): Promise<MarketplaceItemDetail> {
    return await apiClient.get<MarketplaceItemDetail>(`/api/marketplace/${id}`, {
      params: { namespace },
    });
  },

  async installMarketplaceItem(id: string, namespace: string): Promise<unknown> {
    return await apiClient.post(
      `/api/marketplace/${id}/install`,
      { mode: 'command' },
      { params: { namespace } },
    );
  },

  async uninstallMarketplaceItem(id: string, namespace: string): Promise<void> {
    await apiClient.delete(`/api/marketplace/${id}/install`, {
      params: { namespace },
    });
  },
};

export { marketplaceService };
