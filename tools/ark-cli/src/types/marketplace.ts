export interface AnthropicMarketplaceItem {
  name: string;
  displayName?: string;
  description: string;
  type?: 'service' | 'agent';
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  screenshots?: string[];
  documentation?: string;
  support?: {
    email?: string;
    url?: string;
  };
  metadata?: Record<string, unknown>;
  ark?: {
    chartPath?: string;
    namespace?: string;
    helmReleaseName?: string;
    installArgs?: string[];
    k8sServiceName?: string;
    k8sServicePort?: number;
    k8sPortForwardLocalPort?: number;
    k8sDeploymentName?: string;
    k8sDevDeploymentName?: string;
  };
}

export interface AnthropicMarketplaceManifest {
  version: string;
  marketplace: string;
  items: AnthropicMarketplaceItem[];
}
