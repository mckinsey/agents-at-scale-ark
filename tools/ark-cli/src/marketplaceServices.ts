/**
 * Marketplace service definitions for external ARK marketplace resources
 * Repository: https://github.com/mckinsey/agents-at-scale-marketplace
 * Charts are installed from the public OCI registry
 */

import type {
  ArkService,
  ServiceCollection,
} from './types/arkService.js';

const MARKETPLACE_REGISTRY = 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts';

/**
 * Available marketplace services
 * Charts are published to: oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts
 */
export const marketplaceServices: ServiceCollection = {
  phoenix: {
    name: 'phoenix',
    helmReleaseName: 'phoenix',
    description: 'AI/ML observability and evaluation platform with OpenTelemetry integration',
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
    description: 'Open-source LLM observability and analytics platform with session tracking',
    enabled: true,
    category: 'marketplace',
    namespace: 'langfuse',
    chartPath: `${MARKETPLACE_REGISTRY}/langfuse`,
    installArgs: ['--create-namespace'],
    k8sServiceName: 'langfuse',
    k8sServicePort: 3000,
    k8sDeploymentName: 'langfuse-web',
  },
};

export function getMarketplaceService(name: string): ArkService | undefined {
  return marketplaceServices[name];
}

export function getAllMarketplaceServices(): ServiceCollection {
  return marketplaceServices;
}

export function isMarketplaceService(name: string): boolean {
  return name.startsWith('marketplace/');
}

export function extractMarketplaceServiceName(path: string): string {
  return path.replace(/^marketplace\//, '');
}
