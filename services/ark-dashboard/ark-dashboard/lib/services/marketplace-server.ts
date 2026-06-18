import { serverApiClient } from '@/lib/api/server-client';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import {
  generateItemId,
  transformGitHubItemToMarketplaceItem,
  type GitHubMarketplaceItem,
  type MarketplaceItemsGroup,
} from '@/lib/services/marketplace-transform';

interface ResolvedItem {
  item: GitHubMarketplaceItem;
  source: string;
}

async function resolveItem(
  id: string,
  namespace: string,
): Promise<ResolvedItem | null> {
  const groups = await serverApiClient.get<MarketplaceItemsGroup[]>(
    `/v1/namespaces/${encodeURIComponent(namespace)}/marketplace-items`,
  );
  for (const group of groups) {
    if (!group.items) continue;
    const match = group.items.find(item => generateItemId(item) === id);
    if (match) return { item: match, source: group.displayName || group.source };
  }
  return null;
}

export async function getRawMarketplaceItemById(
  id: string,
  namespace: string,
): Promise<GitHubMarketplaceItem | null> {
  const resolved = await resolveItem(id, namespace);
  return resolved?.item ?? null;
}

export async function getMarketplaceItemById(
  id: string,
  namespace: string,
): Promise<MarketplaceItem | null> {
  const resolved = await resolveItem(id, namespace);
  if (!resolved) return null;
  return transformGitHubItemToMarketplaceItem(resolved.item, false, resolved.source);
}
