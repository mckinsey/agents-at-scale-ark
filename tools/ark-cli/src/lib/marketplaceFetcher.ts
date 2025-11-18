import axios from 'axios';
import type {ArkService, ServiceCollection} from '../types/arkService.js';
import type {
  AnthropicMarketplaceManifest,
  AnthropicMarketplaceItem,
} from '../types/marketplace.js';

const MARKETPLACE_REPO_URL =
  'https://github.com/mckinsey/agents-at-scale-marketplace';
const MARKETPLACE_JSON_URL = `${MARKETPLACE_REPO_URL}/raw/main/marketplace.json`;
const MARKETPLACE_REGISTRY =
  'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts';

let cachedManifest: AnthropicMarketplaceManifest | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearMarketplaceCache(): void {
  cachedManifest = null;
  cacheTimestamp = null;
}

export async function fetchMarketplaceManifest(
  forceRefresh = false
): Promise<AnthropicMarketplaceManifest | null> {
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedManifest &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedManifest;
  }

  try {
    const response = await axios.get<AnthropicMarketplaceManifest>(
      MARKETPLACE_JSON_URL,
      {
        timeout: 10000,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    cachedManifest = response.data;
    cacheTimestamp = now;
    return cachedManifest;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return null;
      }
    }
    return null;
  }
}

export function mapMarketplaceItemToArkService(
  item: AnthropicMarketplaceItem,
  registry: string = MARKETPLACE_REGISTRY
): ArkService {
  const serviceName = item.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const chartPath =
    item.ark?.chartPath || `${registry}/${serviceName}`;

  return {
    name: serviceName,
    helmReleaseName: item.ark?.helmReleaseName || serviceName,
    description: item.description,
    enabled: true,
    category: 'marketplace',
    namespace: item.ark?.namespace || serviceName,
    chartPath,
    installArgs: item.ark?.installArgs || ['--create-namespace'],
    k8sServiceName: item.ark?.k8sServiceName || serviceName,
    k8sServicePort: item.ark?.k8sServicePort,
    k8sPortForwardLocalPort: item.ark?.k8sPortForwardLocalPort,
    k8sDeploymentName: item.ark?.k8sDeploymentName || serviceName,
    k8sDevDeploymentName: item.ark?.k8sDevDeploymentName,
  };
}

export async function getMarketplaceServicesFromManifest(
  forceRefresh = false
): Promise<ServiceCollection | null> {
  const manifest = await fetchMarketplaceManifest(forceRefresh);
  if (!manifest || !manifest.items) {
    return null;
  }

  const services: ServiceCollection = {};
  for (const item of manifest.items) {
    if (item.ark) {
      const serviceName = item.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '');
      services[serviceName] = mapMarketplaceItemToArkService(item);
    }
  }

  return Object.keys(services).length > 0 ? services : null;
}

