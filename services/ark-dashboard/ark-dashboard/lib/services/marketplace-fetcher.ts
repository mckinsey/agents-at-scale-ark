import GitUrlParse from 'git-url-parse';

import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';
import { exportService } from '@/lib/services/export';
import { exportServiceServer } from '@/lib/services/export-server';

interface GitHubMarketplaceItem {
  name: string;
  displayName?: string;
  description: string;
  type?: 'service' | 'agent' | 'demo' | 'executor';
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

function extractOrgRepoFromUrl(url: string): string | null {
  try {
    const parsed = GitUrlParse(url);
    if (parsed.full_name) {
      const parts = parsed.full_name.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

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

function mapTypeFromGitHub(type?: 'service' | 'agent' | 'demo' | 'executor'): MarketplaceItemType {
  if (type === 'agent') return 'template';
  if (type === 'service') return 'service';
  if (type === 'demo') return 'demo';
  if (type === 'executor') return 'executor';
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
  if (item.icon?.includes('example.com')) {
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
  return item.icon ?? '📦';
}

export function transformGitHubItemToMarketplaceItem(
  item: GitHubMarketplaceItem,
  isInstalled: boolean = false,
  source?: string,
  uis?: { url: string; label: string }[],
): MarketplaceItem {
  const id = generateItemId(item);
  const now = new Date().toISOString();

  return {
    id,
    name: item.displayName ?? item.name,
    description: item.description || '',
    shortDescription: item.description?.substring(0, 150) || '',
    category: mapCategoryFromGitHub(item.category),
    type: mapTypeFromGitHub(item.type),
    version: item.version ?? '1.0.0',
    author: item.author ?? 'Community',
    repository:
      item.repository ??
      'https://github.com/mckinsey/agents-at-scale-marketplace',
    documentation: item.documentation ?? item.homepage,
    installCommand: item.ark?.helmReleaseName
      ? `helm install ${item.ark.helmReleaseName} ${item.ark.chartPath ?? ''}`
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
    source: source ?? 'Unknown source',
    uis: uis ?? [],
  };
}

export async function fetchMarketplaceManifest(url?: string): Promise<GitHubMarketplaceManifest | null> {
  const manifestUrl = url ?? DEFAULT_MARKETPLACE_MANIFEST_URL;

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

interface HelmRelease {
  name: string;
  namespace: string;
  chart: string;
  chart_version: string;
  app_version: string;
  status: string;
  revision: number;
  updated: string;
  chart_metadata: {
    annotations?: Record<string, string>;
    description?: string;
  };
}

interface HelmReleasesResponse {
  items: HelmRelease[];
  count: number;
}

function getArkApiBaseUrl(): string {
  const isServerSide = typeof window === 'undefined';
  if (!isServerSide) return '';

  const host = process.env.ARK_API_SERVICE_HOST || 'localhost';
  const port = process.env.ARK_API_SERVICE_PORT || '8000';
  const protocol = process.env.ARK_API_SERVICE_PROTOCOL || 'http';

  return `${protocol}://${host}:${port}`;
}

/**
 * Fetch Helm releases from ark-api for marketplace item detection
 */
async function fetchHelmReleases(namespace?: string): Promise<HelmRelease[]> {
  try {
    const baseUrl = getArkApiBaseUrl();

    const url = namespace
      ? `${baseUrl}/v1/ark-services/marketplace-items?namespace=${namespace}`
      : `${baseUrl}/v1/ark-services/marketplace-items`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch Helm releases: ${response.status}`);
      return [];
    }

    const data: HelmReleasesResponse = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching Helm releases:', error);
    return [];
  }
}

/**
 * Fetch UI URLs from Services for multiple Helm releases in a single API call
 */
async function getAllServiceUIs(
  releases: HelmRelease[],
  namespace?: string,
): Promise<Map<string, { url: string; label: string }[]>> {
  try {
    if (releases.length === 0) {
      return new Map();
    }

    const baseUrl = getArkApiBaseUrl();

    // Build set-based labelSelector for all releases
    const releaseNames = releases.map(r => r.name);
    const labelSelector = `app.kubernetes.io/instance in (${releaseNames.join(',')})`;
    const namespaceParam = namespace ? `&namespace=${namespace}` : '';
    const url = `${baseUrl}/v1/resources/api/v1/Service?labelSelector=${encodeURIComponent(labelSelector)}${namespaceParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch Services for releases: ${response.status}`);
      return new Map();
    }

    const data = await response.json();
    const services = data.items || [];

    // Group Services by release name and extract UI URLs
    const uisByRelease = new Map<string, { url: string; label: string }[]>();

    for (const service of services) {
      const releaseName = service.metadata?.labels?.['app.kubernetes.io/instance'];
      if (!releaseName) continue;

      const annotations = service.metadata?.annotations || {};
      const uiUrl = annotations['ark.mckinsey.com/marketplace-item-ui-url'];

      if (uiUrl) {
        if (!uisByRelease.has(releaseName)) {
          uisByRelease.set(releaseName, []);
        }

        const uiLabel =
          annotations['ark.mckinsey.com/marketplace-item-ui-label'] || 'Open';
        uisByRelease.get(releaseName)!.push({ url: uiUrl, label: uiLabel });
      }
    }

    return uisByRelease;
  } catch (error) {
    console.error('Error fetching Service UIs for releases:', error);
    return new Map();
  }
}

/**
 * Get installed marketplace items by checking Helm releases
 */
async function getInstalledMarketplaceItems(
  namespace?: string,
): Promise<Map<string, { isInstalled: boolean; uis: { url: string; label: string }[] }>> {
  try {
    console.log('Fetching Helm releases for marketplace item detection...');

    const releases = await fetchHelmReleases(namespace);

    // Filter to only deployed releases
    const deployedReleases = releases.filter(r => r.status === 'deployed');

    // Fetch UI URLs for all deployed releases in one API call
    const uisByRelease = await getAllServiceUIs(deployedReleases, namespace);

    const installedItems = new Map<
      string,
      { isInstalled: boolean; uis: { url: string; label: string }[] }
    >();

    for (const release of deployedReleases) {
      const chartAnnotations = release.chart_metadata?.annotations || {};
      const marketplaceItemName =
        chartAnnotations['ark.mckinsey.com/marketplace-item-name'];

      if (marketplaceItemName) {
        // Get UI URLs from batch result
        const uis = uisByRelease.get(release.name) || [];

        installedItems.set(marketplaceItemName, {
          isInstalled: true,
          uis,
        });

        console.log(
          `Found installed item: ${marketplaceItemName} with ${uis.length} UI(s)`,
        );
      }
    }

    console.log('Found installed marketplace items:', installedItems.size);
    return installedItems;
  } catch (error) {
    console.error('Failed to fetch installed marketplace items:', error);
    return new Map();
  }
}


export async function fetchMarketplaceItemsFromSource(
  source: MarketplaceSource,
  namespace?: string,
): Promise<MarketplaceItem[]> {
  const manifest = await fetchMarketplaceManifest(source.url);

  if (!manifest?.items) {
    return [];
  }

  // Get actual installation status from cluster via Helm releases
  const installedItems = await getInstalledMarketplaceItems(namespace);

  const urlSource =
    extractOrgRepoFromUrl(source.url) ?? source.displayName ?? source.name;

  return manifest.items.map(item => {
    // Construct marketplace item identifier: type/name
    const itemIdentifier = `${item.type}/${item.name}`;

    // Check if item is installed via Helm release with matching annotation
    const installInfo = installedItems.get(itemIdentifier);
    const isInstalled = installInfo?.isInstalled || false;
    const uis = installInfo?.uis || [];

    return transformGitHubItemToMarketplaceItem(
      item,
      isInstalled,
      urlSource,
      uis,
    );
  });
}

export async function getMarketplaceItemsFromSources(
  sources?: MarketplaceSource[],
  namespace?: string,
): Promise<MarketplaceItem[]> {
  // Use default source if none provided
  const effectiveSources = sources?.length
    ? sources
    : [
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
    enabledSources.map(source =>
      fetchMarketplaceItemsFromSource(source, namespace),
    ),
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
  if (!manifest?.items) {
    return null;
  }

  return manifest.items.find(item => generateItemId(item) === id) || null;
}
