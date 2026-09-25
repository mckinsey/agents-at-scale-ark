'use client';

import type { ComponentType, SVGProps } from 'react';
import { useEffect, useMemo } from 'react';

import { MarketplaceItemCard } from '@/components/cards/marketplace-item-card';
import { ResourcePageHeader } from '@/components/common/resource-page-header';
import {
  AccountTree,
  CheckCircle,
  Dns,
  PlayArrow,
  PlugConnect,
  SmartToy,
  Storefront,
} from '@/components/icons';
import { MarketplaceSourceErrors } from '@/components/marketplace/marketplace-source-errors';
import {
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { IconShell } from '@/components/ui/icon-shell';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { TagToggle } from '@/components/ui/tag-toggle';
import type {
  MarketplaceCategory,
  MarketplaceFilters,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';
import { SEARCH_DEBOUNCE_MS, useUrlState } from '@/lib/hooks/use-url-state';
import { useGetMarketplaceItems } from '@/lib/services/marketplace-hooks';
import { parsePage } from '@/lib/utils/pagination';

const FILTERS: Record<string, Partial<MarketplaceFilters>> = {
  all: { category: undefined, type: undefined, status: undefined },
  agents: {
    category: 'agents' as MarketplaceCategory,
    type: undefined,
    status: undefined,
  },
  workflows: {
    category: 'workflows' as MarketplaceCategory,
    type: undefined,
    status: undefined,
  },
  mcp: {
    category: 'mcp-servers' as MarketplaceCategory,
    type: undefined,
    status: undefined,
  },
  services: {
    category: undefined,
    type: 'service' as MarketplaceItemType,
    status: undefined,
  },
  demo: {
    category: undefined,
    type: 'demo' as MarketplaceItemType,
    status: undefined,
  },
  installed: { category: undefined, type: undefined, status: 'installed' },
} as const;

interface CategoryTab {
  readonly key: string;
  readonly label: string;
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
  readonly iconClass?: string;
}

const CATEGORY_TABS: readonly CategoryTab[] = [
  { key: 'all', label: 'All' },
  {
    key: 'agents',
    label: 'Agents',
    icon: SmartToy,
    iconClass: 'text-blue-500',
  },
  {
    key: 'workflows',
    label: 'Workflows',
    icon: AccountTree,
    iconClass: 'text-pink-500',
  },
  {
    key: 'mcp',
    label: 'MCPs',
    icon: PlugConnect,
    iconClass: 'text-violet-500',
  },
  { key: 'services', label: 'Services', icon: Dns, iconClass: 'text-lime-500' },
  {
    key: 'demo',
    label: 'Demos',
    icon: PlayArrow,
    iconClass: 'text-amber-500',
  },
  { key: 'installed', label: 'Installed', icon: CheckCircle },
];

const TAG_CLASSES =
  'h-8 !px-2 bg-surface-bg-secondary text-fg-secondary ' +
  'data-[state=on]:bg-fill-muted data-[state=on]:text-fg-primary ' +
  'data-[state=on]:focus-visible:bg-fill-muted';

function parseCategory(raw: string): string {
  return Object.hasOwn(FILTERS, raw) ? raw : 'all';
}

const URL_STATE_SPEC = {
  q: { default: '', debounceMs: SEARCH_DEBOUNCE_MS },
  category: { default: 'all', parse: parseCategory },
  page: { default: 1, parse: parsePage },
};

const SKELETON_CARDS = ['a', 'b', 'c', 'd', 'e', 'f'];

export default function MarketplacePage() {
  const [urlState, setUrlState, committedState] = useUrlState(URL_STATE_SPEC);
  const itemsPerPage = 6;

  const filters = useMemo<MarketplaceFilters>(
    () => ({
      ...FILTERS[urlState.category],
      search: committedState.q || undefined,
    }),
    [urlState.category, committedState.q],
  );

  const { data, isPending } = useGetMarketplaceItems(filters);

  // Silent migration: discard the legacy per-browser source list. Sources now
  // live in the cluster (marketplace-sources ConfigMap). One-shot and
  // idempotent — subsequent loads find no key and noop.
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      localStorage.getItem('marketplace-sources') !== null
    ) {
      localStorage.removeItem('marketplace-sources');
    }
  }, []);

  const totalItems = data?.items.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  useEffect(() => {
    if (!data) return;
    if (urlState.page > Math.max(1, totalPages)) {
      setUrlState({ page: 1 });
    }
  }, [data, totalPages, urlState.page, setUrlState]);
  const startIndex = (urlState.page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = data?.items.slice(startIndex, endIndex) || [];

  const pageTitle = data ? `Marketplace (${data.items.length})` : 'Marketplace';

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col">
      <ResourcePageHeader
        icon={<Storefront />}
        title={pageTitle}
        description="Discover reusable components for your AI ecosystem"
      />

      <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-8">
        <div className="flex flex-none flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {CATEGORY_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = urlState.category === tab.key;
              const iconVariant =
                tab.iconClass || isActive ? 'primary' : 'secondary';
              return (
                <TagToggle
                  key={tab.key}
                  size="default"
                  className={TAG_CLASSES}
                  pressed={isActive}
                  onPressedChange={pressed => {
                    if (pressed) {
                      setUrlState({ category: tab.key });
                    }
                  }}>
                  {Icon && (
                    <IconShell
                      size="sm"
                      variant={iconVariant}
                      className={tab.iconClass}>
                      <Icon />
                    </IconShell>
                  )}
                  {tab.label}
                </TagToggle>
              );
            })}
          </div>

          <ResourceSearchInput
            value={urlState.q}
            onChange={q => setUrlState({ q })}
            placeholder="Search"
          />
        </div>

        {!isPending && <MarketplaceSourceErrors errors={data?.sourceErrors} />}

        {isPending && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SKELETON_CARDS.map(card => (
              <Skeleton key={card} className="h-[268px]" />
            ))}
          </div>
        )}

        {!isPending && data && data.items.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {currentItems.map(item => (
              <MarketplaceItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {!isPending && data && data.items.length === 0 && (
          <ResourceNoResults
            icon={<Storefront />}
            message="No marketplace items found"
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-fg-secondary paragraph-small-primary">
              Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of{' '}
              {totalItems} items
            </p>

            <Pagination
              currentPage={urlState.page}
              totalPages={totalPages}
              onPageChange={page => setUrlState({ page })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
