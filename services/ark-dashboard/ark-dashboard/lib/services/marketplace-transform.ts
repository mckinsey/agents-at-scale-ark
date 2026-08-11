import { apiClient } from '@/lib/api/client';
import type {
  MarketplaceCategory,
  MarketplaceItem,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';

export interface GitHubMarketplaceItem {
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
  support?: { email?: string; url?: string };
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

export interface GitHubMarketplaceManifest {
  version: string;
  marketplace: string;
  items: GitHubMarketplaceItem[];
}

/** One source's slice of the ark-api marketplace-items aggregator response. */
export interface MarketplaceItemsGroup {
  source: string;
  displayName: string;
  items?: GitHubMarketplaceItem[];
  error?: { message: string; code: string };
}

interface ServiceUi {
  url: string;
  label: string;
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
  return 'tools';
}

function mapTypeFromGitHub(
  type?: 'service' | 'agent' | 'demo' | 'executor',
): MarketplaceItemType {
  if (type === 'agent') return 'template';
  if (type === 'service') return 'service';
  if (type === 'demo') return 'demo';
  if (type === 'executor') return 'executor';
  return 'component';
}

export function generateItemId(item: GitHubMarketplaceItem): string {
  return item.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, ''); // NOSONAR - anchored, linear-complexity, ReDoS-safe
}

function getIconForItem(item: GitHubMarketplaceItem): string {
  if (item.icon?.includes('example.com')) {
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

    if (item.category) {
      const icon = categoryIcons[item.category.toLowerCase()];
      if (icon) return icon;
    }

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
      if (nameLower.includes(key)) return icon;
    }

    if (item.type === 'agent') return '🤖';
    if (item.type === 'service') return '⚙️';
    return '📦';
  }

  return item.icon ?? '📦';
}

export function transformGitHubItemToMarketplaceItem(
  item: GitHubMarketplaceItem,
  isInstalled: boolean = false,
  source?: string,
  uis?: ServiceUi[],
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
      item.repository ?? 'https://github.com/mckinsey/agents-at-scale-marketplace',
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

// --- Install-status detection (client-side, via ark-api proxy) -------------

interface HelmRelease {
  name: string;
  status: string;
  chart_metadata?: { annotations?: Record<string, string> };
}

interface InstallInfo {
  isInstalled: boolean;
  uis: ServiceUi[];
}

async function fetchDeployedReleases(namespace?: string): Promise<HelmRelease[]> {
  try {
    const response = await apiClient.get<{ items?: HelmRelease[] }>(
      '/api/v1/ark-services/marketplace-items',
      { params: namespace ? { namespace } : undefined },
    );
    return (response.items ?? []).filter(r => r.status === 'deployed');
  } catch {
    return [];
  }
}

async function fetchServiceUis(
  releases: HelmRelease[],
  namespace?: string,
): Promise<Map<string, ServiceUi[]>> {
  const uisByRelease = new Map<string, ServiceUi[]>();
  if (releases.length === 0) return uisByRelease;

  try {
    const labelSelector = `app.kubernetes.io/instance in (${releases
      .map(r => r.name)
      .join(',')})`;
    const response = await apiClient.get<{
      items?: {
        metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> };
      }[];
    }>('/api/v1/resources/api/v1/Service', {
      params: { labelSelector, ...(namespace ? { namespace } : {}) },
    });

    for (const service of response.items ?? []) {
      const releaseName = service.metadata?.labels?.['app.kubernetes.io/instance'];
      const uiUrl = service.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-ui-url'];
      if (!releaseName || !uiUrl) continue;
      const label =
        service.metadata?.annotations?.['ark.mckinsey.com/marketplace-item-ui-label'] || 'Open';
      const existing = uisByRelease.get(releaseName) ?? [];
      existing.push({ url: uiUrl, label });
      uisByRelease.set(releaseName, existing);
    }
  } catch {
    return uisByRelease;
  }
  return uisByRelease;
}

async function getInstalledMarketplaceItems(
  namespace?: string,
): Promise<Map<string, InstallInfo>> {
  const installed = new Map<string, InstallInfo>();
  const releases = await fetchDeployedReleases(namespace);
  const uisByRelease = await fetchServiceUis(releases, namespace);

  for (const release of releases) {
    const itemName =
      release.chart_metadata?.annotations?.['ark.mckinsey.com/marketplace-item-name'];
    if (itemName) {
      installed.set(itemName, {
        isInstalled: true,
        uis: uisByRelease.get(release.name) ?? [],
      });
    }
  }
  return installed;
}

/** Transform the ark-api grouped items response into flat MarketplaceItems. */
export async function buildItemsFromGroups(
  groups: MarketplaceItemsGroup[],
  namespace?: string,
): Promise<MarketplaceItem[]> {
  const installed = await getInstalledMarketplaceItems(namespace);
  const itemsById = new Map<string, MarketplaceItem>();

  for (const group of groups) {
    if (!group.items) continue;
    const sourceLabel = group.displayName || group.source;
    for (const raw of group.items) {
      const installInfo = installed.get(`${raw.type}/${raw.name}`);
      const item = transformGitHubItemToMarketplaceItem(
        raw,
        installInfo?.isInstalled ?? false,
        sourceLabel,
        installInfo?.uis ?? [],
      );
      if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    }
  }
  return Array.from(itemsById.values());
}
