/**
 * Marketplace service definitions for external ARK marketplace resources
 * Repository: https://github.com/mckinsey/agents-at-scale-marketplace
 * Charts are installed from the public OCI registry
 * 
 * Supports Anthropic Marketplace JSON format for dynamic enumeration
 */

import type {ArkService, ServiceCollection} from './types/arkService.js';
import {getMarketplaceServicesFromManifest} from './lib/marketplaceFetcher.js';

const MARKETPLACE_REGISTRY =
  'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts';

/**
 * Fallback marketplace services (used when marketplace.json is unavailable)
 * Charts are published to: oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts
 */
export const fallbackMarketplaceServices: ServiceCollection = {
  phoenix: {
    name: 'phoenix',
    helmReleaseName: 'phoenix',
    description:
      'AI/ML observability and evaluation platform with OpenTelemetry integration',
    enabled: true,
    category: 'marketplace',
    namespace: 'phoenix',
    chartPath: `${MARKETPLACE_REGISTRY}/phoenix`,
    installArgs: ['--create-namespace'],
    k8sServiceName: 'phoenix',
    k8sServicePort: 6006,
    k8sDeploymentName: 'phoenix',
  },
  langfuse: {
    name: 'langfuse',
    helmReleaseName: 'langfuse',
    description:
      'Open-source LLM observability and analytics platform with session tracking',
    enabled: true,
    category: 'marketplace',
    namespace: 'telemetry',
    chartPath: `${MARKETPLACE_REGISTRY}/langfuse`,
    installArgs: ['--create-namespace'],
    k8sServiceName: 'langfuse',
    k8sServicePort: 3000,
    k8sDeploymentName: 'langfuse-web',
  },
};

let cachedServices: ServiceCollection | null = null;

/**
 * Clear the cached marketplace services
 */
export function clearMarketplaceServicesCache(): void {
  cachedServices = null;
}

/**
 * Get all marketplace services, fetching from marketplace.json if available
 * Falls back to hardcoded services if fetch fails
 */
export async function getAllMarketplaceServices(
  forceRefresh = false
): Promise<ServiceCollection> {
  if (forceRefresh) {
    cachedServices = null;
  }

  if (!forceRefresh && cachedServices) {
    return cachedServices;
  }

  const manifestServices = await getMarketplaceServicesFromManifest(
    forceRefresh
  );
  if (manifestServices) {
    cachedServices = manifestServices;
    return manifestServices;
  }

  cachedServices = fallbackMarketplaceServices;
  return fallbackMarketplaceServices;
}

/**
 * Get a specific marketplace service by name
 */
export async function getMarketplaceService(
  name: string
): Promise<ArkService | undefined> {
  const services = await getAllMarketplaceServices();
  return services[name];
}

/**
 * Synchronous version for backward compatibility
 * Returns fallback services immediately
 */
export function getAllMarketplaceServicesSync(): ServiceCollection {
  return fallbackMarketplaceServices;
}

/**
 * Synchronous version for backward compatibility
 */
export function getMarketplaceServiceSync(name: string): ArkService | undefined {
  return fallbackMarketplaceServices[name];
}

export function isMarketplaceService(name: string): boolean {
  return name.startsWith('marketplace/services/');
}

export function extractMarketplaceServiceName(path: string): string {
  // Extract service name from marketplace/services/phoenix
  return path.replace(/^marketplace\/services\//, '');
}
