export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  category: MarketplaceCategory;
  type: MarketplaceItemType;
  version: string;
  author: string;
  repository?: string;
  source?: string;
  documentation?: string;
  installCommand?: string;
  status: MarketplaceItemStatus;
  featured: boolean;
  downloads: number;
  rating?: number;
  tags: string[];
  icon?: string;
  screenshots?: string[];
  createdAt: string;
  updatedAt: string;
}

export type MarketplaceCategory =
  | 'observability'
  | 'tools'
  | 'mcp-servers'
  | 'agents'
  | 'models'
  | 'workflows'
  | 'integrations';

export type MarketplaceItemType =
  | 'service'
  | 'component'
  | 'template'
  | 'plugin';

export type MarketplaceItemStatus =
  | 'available'
  | 'installed'
  | 'updating'
  | 'deprecated';

export interface MarketplaceItemDetail extends MarketplaceItem {
  longDescription: string;
  requirements?: string[];
  dependencies?: string[];
  configuration?: Record<string, unknown>;
  changelog?: ChangelogEntry[];
  reviews?: Review[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface MarketplaceFilters {
  category?: MarketplaceCategory;
  type?: MarketplaceItemType;
  status?: MarketplaceItemStatus;
  search?: string;
  featured?: boolean;
}

export interface MarketplaceResponse {
  items: MarketplaceItem[];
  total: number;
  page: number;
  pageSize: number;
}