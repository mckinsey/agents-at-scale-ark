'use client';

import { AlertTriangle, Store } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { MarketplaceCard } from '@/components/cards/marketplace-card';
import { InstallItemDialog } from '@/components/dialogs/install-item-dialog';
import { MarketplaceSidebar } from '@/components/marketplace-sidebar';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useDelayedLoading } from '@/lib/hooks';
import {
  useDeleteLocalItem,
  useGetMarketplaceItems,
} from '@/lib/services/marketplace-hooks';
import type {
  MarketplaceFilters as Filters,
  MarketplaceItem,
} from '@/lib/types/marketplace';

const TYPE_LABELS: Record<string, string> = {
  agent: 'Agents',
  executor: 'Executors',
  service: 'Services',
  team: 'Teams',
  tool: 'Tools',
};

const TYPE_ORDER = ['agent', 'executor', 'service', 'team', 'tool'];

export function MarketplaceSection() {
  const [filters, setFilters] = useState<Filters>({});
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(
    null,
  );
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const {
    data: items = [],
    isLoading,
    error,
  } = useGetMarketplaceItems(filters);
  const deleteLocalItem = useDeleteLocalItem();
  const isInitialLoad = isLoading && items.length === 0;
  const showLoading = useDelayedLoading(isInitialLoad);

  const filteredItems = useMemo(() => {
    let result = items;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        item =>
          item.displayName.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          item.name.toLowerCase().includes(searchLower),
      );
    }

    if (filters.categories && filters.categories.length > 0) {
      result = result.filter(item =>
        filters.categories!.includes(item.category),
      );
    } else if (filters.category) {
      result = result.filter(item => item.category === filters.category);
    }

    if (filters.types && filters.types.length > 0) {
      result = result.filter(item => filters.types!.includes(item.type));
    } else if (filters.type) {
      result = result.filter(item => item.type === filters.type);
    }

    if (filters.sources && filters.sources.length > 0) {
      result = result.filter(item => filters.sources!.includes(item.source));
    } else if (filters.source) {
      result = result.filter(item => item.source === filters.source);
    }

    if (filters.installed !== undefined) {
      result = result.filter(item => item.installed === filters.installed);
    }

    return result;
  }, [items, filters]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, MarketplaceItem[]> = {};

    filteredItems.forEach(item => {
      const type = item.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(item);
    });

    Object.keys(groups).forEach(type => {
      groups[type].sort((a, b) => a.displayName.localeCompare(b.displayName));
    });

    const sortedTypes = Object.keys(groups).sort((a, b) => {
      const indexA = TYPE_ORDER.indexOf(a);
      const indexB = TYPE_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return sortedTypes.map(type => ({
      type,
      label: TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1),
      items: groups[type],
    }));
  }, [filteredItems]);

  const handleInstall = useCallback((item: MarketplaceItem) => {
    setSelectedItem(item);
    setInstallDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: MarketplaceItem) => {
    console.log('Edit item:', item);
  }, []);

  const handleDelete = useCallback(
    (item: MarketplaceItem) => {
      if (
        confirm(
          `Are you sure you want to delete "${item.displayName}" from the local marketplace?`,
        )
      ) {
        deleteLocalItem.mutate(item.name);
      }
    },
    [deleteLocalItem],
  );

  const handleInstallSuccess = useCallback(() => {
    setInstallDialogOpen(false);
    setSelectedItem(null);
  }, []);

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading marketplace...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <AlertTriangle className="h-10 w-10 text-amber-500" />
          </EmptyMedia>
          <EmptyTitle>Oops! Something went wrong</EmptyTitle>
          <EmptyDescription>
            There was a problem accessing the marketplace. Please check the
            marketplace settings and ensure the ARK API is running.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    );
  }

  return (
    <>
      <div className="flex h-full">
        <MarketplaceSidebar
          items={items}
          filters={filters}
          onFilterChange={setFilters}
        />

        <main className="flex-1 overflow-auto p-6">
          {filteredItems.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Store />
                </EmptyMedia>
                <EmptyTitle>No Items Found</EmptyTitle>
                <EmptyDescription>
                  {items.length === 0
                    ? 'No marketplace items available. Add a marketplace source to get started.'
                    : 'No items match your current filters. Try adjusting your search criteria.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          ) : (
            <div className="space-y-8">
              {groupedItems.map(group => (
                <section key={group.type}>
                  <h2 className="text-foreground mb-4 text-lg font-semibold">
                    {group.label}
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.items.map(item => (
                      <MarketplaceCard
                        key={`${item.source}-${item.name}`}
                        item={item}
                        onInstall={handleInstall}
                        onEdit={
                          item.source === 'Local' ? handleEdit : undefined
                        }
                        onDelete={
                          item.source === 'Local' ? handleDelete : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>

      <InstallItemDialog
        item={selectedItem}
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        onSuccess={handleInstallSuccess}
      />
    </>
  );
}
