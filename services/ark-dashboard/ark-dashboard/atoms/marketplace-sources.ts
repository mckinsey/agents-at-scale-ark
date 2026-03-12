import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface MarketplaceSource {
  id: string;
  name: string;
  url: string;
  displayName?: string;
}

// Default marketplace source
const DEFAULT_MARKETPLACE_SOURCE: MarketplaceSource = {
  id: 'default',
  name: 'ARK marketplace',
  url: 'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
  displayName: 'ARK marketplace',
};

// Persistent storage for marketplace sources
export const marketplaceSourcesAtom = atomWithStorage<MarketplaceSource[]>(
  'marketplace-sources',
  [DEFAULT_MARKETPLACE_SOURCE],
);

// Loading state for marketplace data
export const marketplaceLoadingAtom = atom(false);

// Error state for marketplace data fetching
export const marketplaceErrorAtom = atom<string | null>(null);