'use client';

import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { MarketplaceItemCard } from '@/components/cards/marketplace-item-card';
import { PageHeader } from '@/components/common/page-header';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Dns,
  PlayArrow,
  Search,
  SmartToy,
} from '@/components/icons';
import { MarketplaceSourceErrors } from '@/components/marketplace/marketplace-source-errors';
import { ResourceErrorState } from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  MarketplaceCategory,
  MarketplaceFilters,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useMarketplaceInstallCapability } from '@/lib/hooks/use-marketplace-install-capability';
import { useInstallStateResolver } from '@/lib/hooks/use-marketplace-install-state';
import { useGetMarketplaceItems } from '@/lib/services/marketplace-hooks';

interface CategoryTab {
  readonly key: string;
  readonly label: string;
  readonly icon?: ComponentType;
  readonly filters: Partial<MarketplaceFilters>;
}

const CATEGORY_TABS: readonly CategoryTab[] = [
  {
    key: 'all',
    label: 'All',
    filters: { category: undefined, type: undefined, status: undefined },
  },
  {
    key: 'agents',
    label: 'Agents',
    icon: SmartToy,
    filters: {
      category: 'agents' as MarketplaceCategory,
      type: undefined,
      status: undefined,
    },
  },
  {
    key: 'mcp',
    label: 'MCPs',
    icon: Dns,
    filters: {
      category: 'mcp-servers' as MarketplaceCategory,
      type: undefined,
      status: undefined,
    },
  },
  {
    key: 'demo',
    label: 'Demos',
    icon: PlayArrow,
    filters: {
      category: undefined,
      type: 'demo' as MarketplaceItemType,
      status: undefined,
    },
  },
  {
    key: 'services',
    label: 'Services',
    icon: Dns,
    filters: {
      category: undefined,
      type: 'service' as MarketplaceItemType,
      status: undefined,
    },
  },
  {
    key: 'installed',
    label: 'Installed',
    icon: CheckCircle,
    filters: { category: undefined, type: undefined, status: 'installed' },
  },
];

const ITEMS_PER_PAGE = 6;

export default function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const installEnabled = useMarketplaceInstallCapability();
  const resolveState = useInstallStateResolver();
  const showingInstalled = selectedCategory === 'installed';

  const requestFilters = useMemo(() => {
    if (installEnabled && showingInstalled) {
      return { ...filters, status: undefined };
    }
    return filters;
  }, [filters, installEnabled, showingInstalled]);

  const { data, isPending, isError, refetch } =
    useGetMarketplaceItems(requestFilters);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      localStorage.getItem('marketplace-sources') !== null
    ) {
      localStorage.removeItem('marketplace-sources');
    }
  }, []);

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (installEnabled && showingInstalled) {
      return all.filter(item => resolveState(item) === 'installed');
    }
    return all;
  }, [data?.items, installEnabled, showingInstalled, resolveState]);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentItems = items.slice(startIndex, endIndex);

  const pageTitle = data ? `Marketplace (${totalItems})` : 'Marketplace';

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setFilters(prev => ({
        ...prev,
        search: searchQuery || undefined,
      }));
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);

    const tab = CATEGORY_TABS.find(entry => entry.key === category);
    if (tab) {
      setFilters(prev => ({ ...prev, ...tab.filters }));
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Marketplace"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconShell
                size="sm"
                className="text-fg-secondary absolute top-1/2 left-3 -translate-y-1/2">
                <Search />
              </IconShell>
              <Input
                type="search"
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-[300px] pl-10"
              />
            </div>
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="headings-h3-semibold text-fg-primary">{pageTitle}</h1>
        </div>

        <div className="mt-4 mb-4 flex items-center gap-2">
          {CATEGORY_TABS.map(tab => {
            const Icon = tab.icon;
            const active = selectedCategory === tab.key;

            return (
              <Button
                key={tab.key}
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleCategoryChange(tab.key)}
                className="flex items-center gap-1.5 px-4">
                {Icon ? (
                  <IconShell size="sm">
                    <Icon />
                  </IconShell>
                ) : null}
                {tab.label}
              </Button>
            );
          })}
        </div>

        {!isPending && isError && (
          <ResourceErrorState
            className="mb-4"
            title="Could not load the marketplace"
            description="The marketplace sources could not be reached."
            onRetry={() => refetch()}
          />
        )}

        {!isPending && !isError && (
          <div className="mb-4">
            <MarketplaceSourceErrors errors={data?.sourceErrors} />
          </div>
        )}

        {isPending && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <output className="sr-only">Loading marketplace items</output>
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full" />
            ))}
          </div>
        )}

        {!isPending && !isError && totalItems > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentItems.map(item => (
              <MarketplaceItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {!isPending && !isError && data && totalItems === 0 && (
          <div className="py-12 text-center">
            <p className="paragraph-regular-primary text-fg-secondary">
              No marketplace items found
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="paragraph-small-primary text-fg-secondary">
              Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of{' '}
              {totalItems} items
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}>
                <IconShell size="sm">
                  <ChevronLeft />
                </IconShell>
              </Button>

              <span className="paragraph-small-primary text-fg-primary">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                onClick={() =>
                  setCurrentPage(prev => Math.min(totalPages, prev + 1))
                }
                disabled={currentPage === totalPages}>
                <IconShell size="sm">
                  <ChevronRight />
                </IconShell>
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
