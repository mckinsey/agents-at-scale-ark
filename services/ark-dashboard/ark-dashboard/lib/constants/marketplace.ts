export const MARKETPLACE_ITEM_PARAM = 'item';

export function buildMarketplaceItemUrl(itemId: string): string {
  return `/marketplace?${MARKETPLACE_ITEM_PARAM}=${encodeURIComponent(itemId)}`;
}
