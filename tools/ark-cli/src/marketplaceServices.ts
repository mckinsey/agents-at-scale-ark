/**
 * Marketplace service definitions for external ARK marketplace resources
 * Repository: https://github.com/mckinsey/agents-at-scale-marketplace
 * Charts are installed from the public OCI registry
 *
 * Supports Anthropic Marketplace JSON format for dynamic enumeration
 */

import type {ArkService, ServiceCollection} from './types/arkService.js';
import {getMarketplaceServicesFromManifest} from './lib/marketplaceFetcher.js';

/**
 * Get all marketplace services, fetching from marketplace.json
 * Returns null if marketplace is unavailable
 */
export async function getAllMarketplaceServices(): Promise<ServiceCollection | null> {
  return await getMarketplaceServicesFromManifest();
}

/**
 * Get a specific marketplace service by name
 * Returns null if marketplace is unavailable
 */
export async function getMarketplaceService(
  name: string
): Promise<ArkService | undefined | null> {
  const services = await getAllMarketplaceServices();
  if (!services) {
    return null;
  }
  return services[name];
}

export function isMarketplaceService(name: string): boolean {
  return name.startsWith('marketplace/services/');
}

export function extractMarketplaceServiceName(path: string): string {
  // Extract service name from marketplace/services/phoenix
  return path.replace(/^marketplace\/services\//, '');
}
