/**
 * Centralized ARK service definitions used by both install and status commands
 */

export interface ArkService {
  name: string;
  helmReleaseName: string;
  description: string;
  enabled: boolean; // Whether this service is enabled
  namespace?: string; // Optional - if undefined, uses current namespace
  chartPath?: string;
  installArgs?: string[];
  k8sServiceName?: string;
  k8sServicePort?: number;
  k8sPortForwardLocalPort?: number;
  k8sDeploymentName?: string;
  k8sDevDeploymentName?: string;
}

export interface ServiceCollection {
  [key: string]: ArkService;
}

export interface ArkDependency {
  name: string;
  command: string;
  args: string[];
  description: string;
}

export interface DependencyCollection {
  [key: string]: ArkDependency;
}

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
 * Core ARK services with their installation and status check configurations
 */
export const arkServices: ServiceCollection = {
  'ark-controller': {
    name: 'ark-controller',
    helmReleaseName: 'ark-controller',
    description: 'Core Ark controller for managing AI resources',
    enabled: true,
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/ark-controller`,
    installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
    k8sDeploymentName: 'ark-controller',
    k8sDevDeploymentName: 'ark-controller-devspace',
  },

  'ark-api': {
    name: 'ark-api',
    helmReleaseName: 'ark-api',
    description: 'API layer for interacting with Ark resources',
    enabled: true,
    // namespace: undefined - uses current context namespace
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
    // namespace: undefined - uses current context namespace
    chartPath: `${REGISTRY_BASE}/ark-dashboard`,
    installArgs: [],
    k8sServiceName: 'ark-dashboard',
    k8sServicePort: 3000,
    k8sDeploymentName: 'ark-dashboard',
    k8sDevDeploymentName: 'ark-dashboard-devspace',
    k8sPortForwardLocalPort: 3274,
  },

  'ark-api-a2a': {
    name: 'ark-api-a2a',
    helmReleaseName: 'ark-api-a2a',
    description: 'Ark API agent-to-agent communication service',
    enabled: false, // Disabled - not currently used
    // namespace: undefined - uses current context namespace
    // Note: This service might be installed as part of ark-api or separately
  },

  'ark-mcp': {
    name: 'ark-mcp',
    helmReleaseName: 'ark-mcp',
    description: 'Ark Model Context Protocol server',
    enabled: true,
    // namespace: undefined - uses current context namespace
    chartPath: `${REGISTRY_BASE}/ark-mcp`,
    installArgs: [],
    k8sDeploymentName: 'ark-mcp',
    k8sDevDeploymentName: 'ark-mcp-devspace',
  },

  'localhost-gateway': {
    name: 'localhost-gateway',
    helmReleaseName: 'localhost-gateway',
    description: 'Gateway for local development clusters',
    enabled: false, // Disabled - not needed for most users
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/localhost-gateway`,
    installArgs: [],
  },
};

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
