/**
 * Marketplace service definitions for external ARK marketplace resources
 * Repository: https://github.com/mckinsey/agents-at-scale-marketplace
 * Charts are installed from the public OCI registry
 *
 * Supports Anthropic Marketplace JSON format for dynamic enumeration
 */

import type {ArkService, ServiceCollection} from './types/arkService.js';
import {
  getMarketplaceServicesFromManifest,
  getMarketplaceAgentsFromManifest,
} from './lib/marketplaceFetcher.js';

/**
 * Get all marketplace services, fetching from marketplace.json
 * Returns null if marketplace is unavailable
 */
export async function getAllMarketplaceServices(): Promise<ServiceCollection | null> {
  return await getMarketplaceServicesFromManifest();
}

/**
 * Get all marketplace agents, fetching from marketplace.json
 * Returns null if marketplace is unavailable
 */
export async function getAllMarketplaceAgents(): Promise<ServiceCollection | null> {
  return await getMarketplaceAgentsFromManifest();
}

/**
 * Get a marketplace item by path (supports both services and agents)
 * Returns null if marketplace is unavailable
 */
export async function getMarketplaceItem(
  path: string
): Promise<ArkService | undefined | null> {
  if (path.startsWith('marketplace/services/')) {
    const name = path.replace(/^marketplace\/services\//, '');
    const services = await getAllMarketplaceServices();
    if (!services) {
      return null;
    }
    return services[name];
  }
  if (path.startsWith('marketplace/agents/')) {
    const name = path.replace(/^marketplace\/agents\//, '');
    const agents = await getAllMarketplaceAgents();
    if (!agents) {
      return null;
    }
    return agents[name];
  }
  return undefined;
}

export function isMarketplaceService(name: string): boolean {
  return (
    name.startsWith('marketplace/services/') ||
    name.startsWith('marketplace/agents/')
  );
}
