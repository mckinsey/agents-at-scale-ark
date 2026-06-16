'use client';

import { AlertCircle, ArrowRight, Package } from 'lucide-react';
import { forwardRef, useEffect } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import { MarketplaceItemCard } from '@/components/cards/marketplace-item-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarketplaceFilters } from '@/lib/api/generated/marketplace-types';
import { useGetMarketplaceItems } from '@/lib/services/marketplace-hooks';

interface MarketplaceSectionProps {
  filters?: MarketplaceFilters;
  showHeader?: boolean;
  limit?: number;
}

export const MarketplaceSection = forwardRef<
  HTMLDivElement,
  MarketplaceSectionProps
>(({ filters = { featured: true }, showHeader = true, limit = 6 }, ref) => {
  const { data, isPending, error } = useGetMarketplaceItems(filters);

  useEffect(() => {
    if (error) {
      toast.error('Failed to load marketplace items', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error]);

  const displayItems = data?.items.slice(0, limit) || [];

  return (
    <div ref={ref} className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold">Marketplace</h3>
            <p className="text-muted-foreground">
              Discover and install community extensions, tools, and integrations
            </p>
          </div>
          <NamespacedLink href="/marketplace">
            <Button variant="outline" className="gap-2">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </NamespacedLink>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load marketplace items. Please try again later.
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <MarketplaceItemSkeleton key={index} />
          ))}
        </div>
      )}

      {!isPending && !error && displayItems.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>No marketplace items</EmptyTitle>
            <EmptyDescription>
              No items available in the marketplace yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isPending && !error && displayItems.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayItems.map(item => (
            <MarketplaceItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
});

MarketplaceSection.displayName = 'MarketplaceSection';

function MarketplaceItemSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-12" />
      </div>
      <div className="flex justify-between pt-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}
