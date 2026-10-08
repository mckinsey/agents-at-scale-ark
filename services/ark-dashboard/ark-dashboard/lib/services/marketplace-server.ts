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

interface ResolvedItem {
  item: GitHubMarketplaceItem;
  source: string;
}

async function resolveItem(
  request: NextRequest,
  id: string,
  namespace: string,
): Promise<ResolvedItem | null> {
  const headers = await getArkApiAuthHeaders(request);
  const groups = await serverApiClient.get<MarketplaceItemsGroup[]>(
    `/v1/namespaces/${encodeURIComponent(namespace)}/marketplace-items`,
    { headers },
  );
  for (const group of groups) {
    if (!group.items) continue;
    const match = group.items.find(item => generateItemId(item) === id);
    if (match)
      return { item: match, source: group.displayName || group.source };
  }
  return null;
}

export async function getRawMarketplaceItemById(
  request: NextRequest,
  id: string,
  namespace: string,
): Promise<GitHubMarketplaceItem | null> {
  const resolved = await resolveItem(request, id, namespace);
  return resolved?.item ?? null;
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
    resolved.source,
  );
}
