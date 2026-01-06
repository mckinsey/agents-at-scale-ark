export interface MarketplaceSource {
  name: string;
  url: string;
  enabled: boolean;
  addedAt?: string;
}

export interface MarketplaceSourceCreate {
  url: string;
  name?: string;
}

export interface MarketplaceItemArk {
  chartPath?: string;
  namespace?: string;
  helmReleaseName?: string;
  installArgs?: string[];
  k8sServiceName?: string;
  k8sServicePort?: number;
  k8sDeploymentName?: string;
  image?: string;
  agentic?: boolean;
  requirements?: string[];
}

export interface MarketplaceItem {
  name: string;
  type: 'service' | 'agent' | 'executor' | 'tool' | 'team';
  displayName: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  tags: string[];
  category: string;
  icon?: string;
  documentation?: string;
  support?: { url: string };
  ark: MarketplaceItemArk;
  source: string;
  installed: boolean;
  installedNamespace?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketplaceItemList {
  items: MarketplaceItem[];
  total: number;
}

export interface MarketplaceSourceList {
  sources: MarketplaceSource[];
}

export interface LocalItemCreate {
  name: string;
  type: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  category: string;
  icon?: string;
  documentation?: string;
  ark: MarketplaceItemArk;
}

export interface LocalItemUpdate {
  displayName?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  documentation?: string;
  ark?: MarketplaceItemArk;
}

export interface MarketplaceFilters {
  category?: string;
  type?: string;
  source?: string;
  categories?: string[];
  types?: string[];
  sources?: string[];
  search?: string;
  installed?: boolean;
}

export interface InstallOptions {
  namespace: string;
  releaseName?: string;
}

export interface InstallResult {
  status: 'installed' | 'failed';
  type: string;
  name: string;
  namespace: string;
  details?: Record<string, unknown>;
  error?: string;
}
