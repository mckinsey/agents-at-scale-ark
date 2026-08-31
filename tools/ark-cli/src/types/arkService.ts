export interface PrerequisiteUninstall {
  releaseName: string;
  namespace?: string;
}

export interface ArkService {
  name: string;
  helmReleaseName: string;
  description: string;
  enabled: boolean;
  mandatory?: boolean;
  category: string;
  namespace?: string;
  chartPath?: string;
  installArgs?: string[];
  prerequisiteUninstalls?: PrerequisiteUninstall[];
  requires?: string[];
  // Extra helm args applied only when --no-deps skips installing `requires`,
  // so a chart-level guard for the missing dependency doesn't block install.
  dependencyOverrideArgs?: string[];
  k8sServiceName?: string;
  k8sServicePort?: number;
  k8sPortForwardLocalPort?: number;
  k8sDeploymentName?: string;
  k8sDevDeploymentName?: string;
  requiresBackend?: 'etcd' | 'postgresql';
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
