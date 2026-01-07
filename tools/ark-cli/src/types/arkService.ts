export interface PrerequisiteUninstall {
  releaseName: string;
  namespace?: string;
}

export interface ArkService {
  name: string;
  helmReleaseName: string;
  description: string;
  enabled: boolean;
  category: string;
  namespace?: string;
  chartPath?: string;
  installArgs?: string[];
  prerequisiteUninstalls?: PrerequisiteUninstall[];
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
