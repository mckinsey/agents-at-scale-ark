import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';

interface GitHubMarketplaceItem {
  name: string;
  displayName?: string;
  description: string;
  type?: 'service' | 'agent';
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  screenshots?: string[];
  documentation?: string;
  support?: {
    email?: string;
    url?: string;
  };
  metadata?: Record<string, unknown>;
  ark?: {
    chartPath?: string;
    namespace?: string;
    helmReleaseName?: string;
    installArgs?: string[];
    k8sServiceName?: string;
    k8sServicePort?: number;
    k8sPortForwardLocalPort?: number;
    k8sDeploymentName?: string;
    k8sDevDeploymentName?: string;
  };
}

interface GitHubMarketplaceManifest {
  version: string;
  marketplace: string;
  items: GitHubMarketplaceItem[];
}

const DEFAULT_MARKETPLACE_MANIFEST_URL =
  'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json';

function mapCategoryFromGitHub(category?: string): MarketplaceCategory {
  const categoryMap: Record<string, MarketplaceCategory> = {
    observability: 'observability',
    tools: 'tools',
    'mcp-servers': 'mcp-servers',
    mcp: 'mcp-servers',
    agents: 'agents',
    agent: 'agents',
    models: 'models',
    model: 'models',
    workflows: 'workflows',
    workflow: 'workflows',
    integrations: 'integrations',
    integration: 'integrations',
  };

  if (category) {
    const mapped = categoryMap[category.toLowerCase()];
    if (mapped) return mapped;
  }

  return 'tools'; // default category
}

function mapTypeFromGitHub(type?: 'service' | 'agent'): MarketplaceItemType {
  if (type === 'agent') return 'template';
  if (type === 'service') return 'service';
  return 'component'; // default type
}

function generateItemId(item: GitHubMarketplaceItem): string {
  return item.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, ''); // NOSONAR - This regex is safe from ReDoS, uses anchored patterns with linear complexity
}

function getIconForItem(item: GitHubMarketplaceItem): string {
  // Check if icon is a placeholder URL
  if (item.icon && item.icon.includes('example.com')) {
    // Return emoji based on category or type
    const categoryIcons: Record<string, string> = {
      observability: '📊',
      tools: '🛠️',
      'mcp-servers': '🔌',
      mcp: '🔌',
      agents: '🤖',
      agent: '🤖',
      models: '🧠',
      model: '🧠',
      workflows: '🔄',
      workflow: '🔄',
      integrations: '🔗',
      integration: '🔗',
      development: '💻',
      testing: '🧪',
      security: '🔒',
      monitoring: '📈',
    };

    // Try category first, then type
    if (item.category) {
      const icon = categoryIcons[item.category.toLowerCase()];
      if (icon) return icon;
    }

    // Check name for specific services
    const nameToIcon: Record<string, string> = {
      phoenix: '🔥',
      langfuse: '📝',
      'a2a-inspector': '🔍',
      postgres: '🐘',
      redis: '💾',
      kafka: '📨',
      elasticsearch: '🔎',
      grafana: '📊',
      prometheus: '📈',
    };

    const nameLower = item.name.toLowerCase();
    for (const [key, icon] of Object.entries(nameToIcon)) {
      if (nameLower.includes(key)) {
        return icon;
      }
    }

    // Default based on type
    if (item.type === 'agent') return '🤖';
    if (item.type === 'service') return '⚙️';

    // Final fallback
    return '📦';
  }

  // Return original icon if it's not a placeholder
  return item.icon || '📦';
}

export function transformGitHubItemToMarketplaceItem(
  item: GitHubMarketplaceItem,
  isInstalled: boolean = false,
): MarketplaceItem {
  const id = generateItemId(item);
  const now = new Date().toISOString();

  return {
    id,
    name: item.displayName || item.name,
    description: item.description || '',
    shortDescription: item.description?.substring(0, 150) || '',
    category: mapCategoryFromGitHub(item.category),
    type: mapTypeFromGitHub(item.type),
    version: item.version || '1.0.0',
    author: item.author || 'Community',
    repository:
      item.repository ||
      'https://github.com/mckinsey/agents-at-scale-marketplace',
    documentation: item.documentation || item.homepage,
    installCommand: item.ark?.helmReleaseName
      ? `helm install ${item.ark.helmReleaseName} ${item.ark.chartPath || ''}`
      : undefined,
    status: isInstalled ? 'installed' : 'available',
    featured: false,
    downloads: 0,
    rating: undefined,
    tags: item.tags || [],
    icon: getIconForItem(item),
    screenshots: item.screenshots?.filter(
      url => url && !url.includes('example.com'),
    ),
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchMarketplaceManifest(url?: string): Promise<GitHubMarketplaceManifest | null> {
  const manifestUrl = url || DEFAULT_MARKETPLACE_MANIFEST_URL;

  try {
    console.log(
      'Fetching marketplace manifest from:',
      manifestUrl,
    );
    const response = await fetch(manifestUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch marketplace manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as GitHubMarketplaceManifest;
    console.log(
      `Successfully fetched ${data.items?.length || 0} marketplace items from ${manifestUrl}`,
    );
    return data;
  } catch (error) {
    console.error(`Error fetching marketplace manifest from ${manifestUrl}:`, error);
    return null;
  }
}

export interface MarketplaceSource {
  id: string;
  name: string;
  url: string;
  displayName?: string;
  enabled?: boolean;
}

export async function fetchMarketplaceItemsFromSource(
  source: MarketplaceSource,
): Promise<MarketplaceItem[]> {
  const manifest = await fetchMarketplaceManifest(source.url);

  if (!manifest || !manifest.items) {
    return [];
  }

  // TODO: Check actual installation status from cluster
  const installedItems = new Set<string>();

  return manifest.items.map(item => ({
    ...transformGitHubItemToMarketplaceItem(
      item,
      installedItems.has(generateItemId(item)),
    ),
    source: source.displayName || source.name,
  }));
}

export async function getMarketplaceItemsFromSources(
  sources?: MarketplaceSource[],
): Promise<MarketplaceItem[]> {
  // Use default source if none provided
  const effectiveSources = sources?.length ? sources : [
    {
      id: 'default',
      name: 'ARK marketplace',
      url: DEFAULT_MARKETPLACE_MANIFEST_URL,
      displayName: 'ARK marketplace',
      enabled: true,
    },
  ];

  // Only fetch from enabled sources
  const enabledSources = effectiveSources.filter(s => s.enabled !== false);

  // Fetch from all sources in parallel
  const allItemsArrays = await Promise.all(
    enabledSources.map(source => fetchMarketplaceItemsFromSource(source))
  );

  // Flatten and deduplicate items by ID
  const itemsMap = new Map<string, MarketplaceItem>();
  for (const items of allItemsArrays) {
    for (const item of items) {
      if (!itemsMap.has(item.id)) {
        itemsMap.set(item.id, item);
      }
    }
  }

  return Array.from(itemsMap.values());
}

// Keep the original function for backward compatibility
export async function getMarketplaceItems(): Promise<MarketplaceItem[]> {
  return getMarketplaceItemsFromSources();
}

export async function getMarketplaceItemById(
  id: string,
): Promise<MarketplaceItem | null> {
  const items = await getMarketplaceItems();
  return items.find(item => item.id === id) || null;
}

export async function getRawMarketplaceItemById(
  id: string,
): Promise<GitHubMarketplaceItem | null> {
  const manifest = await fetchMarketplaceManifest();
  if (!manifest || !manifest.items) {
    return null;
  }

  return manifest.items.find(item => generateItemId(item) === id) || null;
}
