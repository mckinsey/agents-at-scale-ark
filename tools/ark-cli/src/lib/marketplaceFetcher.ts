import axios from 'axios';
import type {ArkService, ServiceCollection} from '../types/arkService.js';
import type {
  AnthropicMarketplaceManifest,
  AnthropicMarketplaceItem,
} from '../types/marketplace.js';
import {getMarketplaceRepoUrl, getMarketplaceRegistry} from './config.js';

export async function fetchMarketplaceManifest(): Promise<AnthropicMarketplaceManifest | null> {
  const repoUrl = getMarketplaceRepoUrl();
  const manifestUrl = `${repoUrl}/raw/main/marketplace.json`;

  try {
    const response = await axios.get<AnthropicMarketplaceManifest>(manifestUrl, {
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });

    return response.data;
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
  registry?: string
): ArkService {
  const defaultRegistry = registry || getMarketplaceRegistry();

  const serviceName = item.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const chartPath = item.ark?.chartPath || `${defaultRegistry}/${serviceName}`;

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

export async function getMarketplaceServicesFromManifest(): Promise<ServiceCollection | null> {
  const manifest = await fetchMarketplaceManifest();
  if (!manifest || !manifest.items) {
    return null;
  }

  const services: ServiceCollection = {};
  for (const item of manifest.items) {
    if (item.ark && item.type === 'service') {
      const serviceName = item.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '');
      services[serviceName] = mapMarketplaceItemToArkService(item);
    }
  }

  return Object.keys(services).length > 0 ? services : null;
}

export async function getMarketplaceAgentsFromManifest(): Promise<ServiceCollection | null> {
  const manifest = await fetchMarketplaceManifest();
  if (!manifest || !manifest.items) {
    return null;
  }

  const agents: ServiceCollection = {};
  for (const item of manifest.items) {
    if (item.ark && item.type === 'agent') {
      const agentName = item.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '');
      agents[agentName] = mapMarketplaceItemToArkService(item);
    }
  }

  return Object.keys(agents).length > 0 ? agents : null;
}

