/**
 * Centralized ARK service definitions used by both install and status commands
 */

import {loadConfig, getMarketplaceRegistry} from './lib/config.js';
import type {
  ArkService,
  ServiceCollection,
  ArkDependency,
  DependencyCollection,
} from './types/arkService.js';

export type {
  ArkService,
  ServiceCollection,
  ArkDependency,
  DependencyCollection,
};

const REGISTRY_BASE = 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts';

/**
 * Dependencies that should be installed before ARK services
 * Note: Dependencies will be installed in the order they are defined here
 */
export const arkDependencies: DependencyCollection = {
  'cert-manager-repo': {
    name: 'cert-manager-repo',
    command: 'helm',
    args: [
      'repo',
      'add',
      'jetstack',
      'https://charts.jetstack.io',
      '--force-update',
    ],
    description: 'Add Jetstack Helm repository',
  },

  'helm-repo-update': {
    name: 'helm-repo-update',
    command: 'helm',
    args: ['repo', 'update'],
    description: 'Update Helm repositories',
  },

  'cert-manager': {
    name: 'cert-manager',
    command: 'helm',
    args: [
      'upgrade',
      '--install',
      'cert-manager',
      'jetstack/cert-manager',
      '--namespace',
      'cert-manager',
      '--create-namespace',
      '--set',
      'crds.enabled=true',
    ],
    description: 'Certificate management for Kubernetes',
  },

  'gateway-api-crds': {
    name: 'gateway-api-crds',
    command: 'kubectl',
    args: [
      'apply',
      '-f',
      'https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml',
    ],
    description: 'Gateway API CRDs',
  },
};

/**
 * Default ARK services with their installation and status check configurations
 */
const defaultArkServices: ServiceCollection = {
  'ark-controller': {
    name: 'ark-controller',
    helmReleaseName: 'ark-controller',
    description: 'Core Ark controller for managing AI resources',
    enabled: true,
    category: 'core',
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/ark-controller`,
    installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
    k8sDeploymentName: 'ark-controller',
    k8sDevDeploymentName: 'ark-controller-devspace',
  },

  'ark-tenant': {
    name: 'ark-tenant',
    helmReleaseName: 'ark-tenant',
    description: 'Tenant provisioning with RBAC and resource quotas',
    enabled: true,
    category: 'core',
    chartPath: `${REGISTRY_BASE}/ark-tenant`,
    installArgs: [],
  },

  'ark-api': {
    name: 'ark-api',
    helmReleaseName: 'ark-api',
    description: 'API layer for interacting with Ark resources',
    enabled: true,
    category: 'service',
    chartPath: `${REGISTRY_BASE}/ark-api`,
    installArgs: [],
    k8sServiceName: 'ark-api',
    k8sServicePort: 80,
    k8sDeploymentName: 'ark-api',
    k8sDevDeploymentName: 'ark-api-devspace',
    k8sPortForwardLocalPort: 34780,
  },

  'ark-dashboard': {
    name: 'ark-dashboard',
    helmReleaseName: 'ark-dashboard',
    description: 'Ark Dashboard',
    enabled: true,
    category: 'service',
    // namespace: undefined - uses current context namespace
    chartPath: `${REGISTRY_BASE}/ark-dashboard`,
    installArgs: [],
    k8sServiceName: 'ark-dashboard',
    k8sServicePort: 3000,
    k8sDeploymentName: 'ark-dashboard',
    k8sDevDeploymentName: 'ark-dashboard-devspace',
    k8sPortForwardLocalPort: 3274,
  },

  'ark-mcp': {
    name: 'ark-mcp',
    helmReleaseName: 'ark-mcp',
    description: 'Ark Model Context Protocol server',
    enabled: true,
    category: 'service',
    // namespace: undefined - uses current context namespace
    chartPath: `${REGISTRY_BASE}/ark-mcp`,
    installArgs: [],
    k8sDeploymentName: 'ark-mcp',
    k8sDevDeploymentName: 'ark-mcp-devspace',
  },

  // ark-broker replaces ark-cluster-memory (renamed in v0.1.49). The old release
  // must be uninstalled first to avoid Helm ownership conflicts on shared
  // resources like the ark-config-streaming ConfigMap.
  'ark-broker': {
    name: 'ark-broker',
    helmReleaseName: 'ark-broker',
    description:
      'In-memory storage service with streaming support for Ark queries',
    enabled: true,
    category: 'service',
    chartPath: `${REGISTRY_BASE}/ark-broker`,
    installArgs: [],
    prerequisiteUninstalls: [{releaseName: 'ark-cluster-memory'}],
    k8sDeploymentName: 'ark-broker',
    k8sDevDeploymentName: 'ark-broker-devspace',
  },

  'mcp-filesystem': {
    name: 'mcp-filesystem',
    helmReleaseName: 'mcp-filesystem',
    description: 'Stateful filesystem MCP server with workspace isolation',
    enabled: false,
    category: 'service',
    // namespace: undefined - uses current context namespace
    chartPath: `${REGISTRY_BASE}/mcp-filesystem`,
    installArgs: [],
    k8sDeploymentName: 'mcp-filesystem',
    k8sDevDeploymentName: 'mcp-filesystem-devspace',
  },

  'localhost-gateway': {
    name: 'localhost-gateway',
    helmReleaseName: 'localhost-gateway',
    description: 'Gateway for local development clusters',
    enabled: false, // Disabled - not needed for most users
    category: 'service',
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/localhost-gateway`,
    installArgs: [],
  },

  'noah': {
    name: 'noah',
    helmReleaseName: 'noah',
    description: 'Runtime administration agent with cluster privileges',
    enabled: true,
    category: 'service',
    chartPath: `${getMarketplaceRegistry()}/noah`,
    installArgs: [],
    k8sServiceName: 'noah-mcp',
    k8sServicePort: 8639,
    k8sDeploymentName: 'noah-mcp',
  },
};

function applyConfigOverrides(defaults: ServiceCollection): ServiceCollection {
  const config = loadConfig();
  const overrides = config?.services || {};
  const result: ServiceCollection = {};

  for (const [key, service] of Object.entries(defaults)) {
    const override = overrides[key];
    result[key] =
      override && typeof override === 'object' ? {...service, ...override} : service;
  }

  return result;
}

/**
 * Core ARK services - initialized with defaults and config overrides applied
 */
export const arkServices: ServiceCollection =
  applyConfigOverrides(defaultArkServices);

/**
 * Get services that can be installed via Helm charts (only enabled services)
 */
export function getInstallableServices(): ServiceCollection {
  const installable: ServiceCollection = {};

  for (const [key, service] of Object.entries(arkServices)) {
    if (service.enabled && service.chartPath) {
      installable[key] = service;
    }
  }

  return installable;
}
