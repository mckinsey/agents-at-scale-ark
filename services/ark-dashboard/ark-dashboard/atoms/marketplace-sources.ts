import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

export interface MarketplaceSource {
  id: string;
  name: string;
  url: string;
  displayName?: string;
  enabled?: boolean;
}

// Default marketplace source
const DEFAULT_MARKETPLACE_SOURCE: MarketplaceSource = {
  id: 'default',
  name: 'ARK marketplace',
  url: 'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
  displayName: 'ARK marketplace',
  enabled: true,
};

// Custom storage that handles SSR properly
const storage = createJSONStorage<MarketplaceSource[]>(() => {
  // Only use localStorage on the client
  if (typeof window !== 'undefined') {
    return localStorage;
  }
  // Return a no-op storage for SSR
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
});

// Persistent storage for marketplace sources
export const marketplaceSourcesAtom = atomWithStorage<MarketplaceSource[]>(
  'marketplace-sources',
  [DEFAULT_MARKETPLACE_SOURCE],
  storage,
  { getOnInit: true },
);

// Loading state for marketplace data
export const marketplaceLoadingAtom = atom(false);

// Error state for marketplace data fetching
export const marketplaceErrorAtom = atom<string | null>(null);