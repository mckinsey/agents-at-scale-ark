import type { NextRequest } from 'next/server';

import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { serverApiClient } from '@/lib/api/server-client';
import { getArkApiAuthHeaders } from '@/lib/auth/server-auth-headers';
import {
  type GitHubMarketplaceItem,
  type MarketplaceItemsGroup,
  generateItemId,
  transformGitHubItemToMarketplaceItem,
} from '@/lib/services/marketplace-transform';

export interface ResolvedMarketplaceItem {
  item: GitHubMarketplaceItem;
  source: string;
  sourceLabel: string;
  sourceUrl?: string;
}

async function resolveItem(
  request: NextRequest,
  id: string,
  namespace: string,
): Promise<ResolvedMarketplaceItem | null> {
  const headers = await getArkApiAuthHeaders(request);
  const groups = await serverApiClient.get<MarketplaceItemsGroup[]>(
    `/v1/namespaces/${encodeURIComponent(namespace)}/marketplace-items`,
    { headers },
  );
  for (const group of groups) {
    if (!group.items) continue;
    const match = group.items.find(item => generateItemId(item) === id);
    if (match)
      return {
        item: match,
        source: group.source,
        sourceLabel: group.displayName || group.source,
        sourceUrl: group.url,
      };
  }
  return null;
}

export async function getRawMarketplaceItemById(
  request: NextRequest,
  id: string,
  namespace: string,
): Promise<ResolvedMarketplaceItem | null> {
  return resolveItem(request, id, namespace);
}

export async function getMarketplaceItemById(
  request: NextRequest,
  id: string,
  namespace: string,
): Promise<MarketplaceItem | null> {
  const resolved = await resolveItem(request, id, namespace);
  if (!resolved) return null;
  return transformGitHubItemToMarketplaceItem(
    resolved.item,
    false,
    resolved.sourceLabel,
  );
}
