'use client';

import {
  Bot,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Server,
  SquarePlay,
} from 'lucide-react';
import { useState } from 'react';

import { MarketplaceItemCard } from '@/components/cards/marketplace-item-card';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import type {
  MarketplaceCategory,
  MarketplaceFilters,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';
import { useGetMarketplaceItems } from '@/lib/services/marketplace-hooks';
import { cn } from '@/lib/utils';

const FILTERS: Record<string, Partial<MarketplaceFilters>> = {
  all: { category: undefined, type: undefined, status: undefined },
  agents: { category: 'agents' as MarketplaceCategory, type: undefined, status: undefined },
  mcp: { category: 'mcp-servers' as MarketplaceCategory, type: undefined, status: undefined },
  demo: { category: undefined, type: 'demo' as MarketplaceItemType, status: undefined },
  services: { category: undefined, type: 'service' as MarketplaceItemType, status: undefined },
  installed: { category: undefined, type: undefined, status: 'installed' },
} as const;

export default function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const { data, isPending } = useGetMarketplaceItems(filters);

  const totalItems = data?.items.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = data?.items.slice(startIndex, endIndex) || [];

  const pageTitle = data ? `Marketplace (${data.items.length})` : 'Marketplace';

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // Reset to first page on search
    setFilters(prev => ({
      ...prev,
      search: value || undefined,
    }));
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1); // Reset to first page on category change

    const newFilter = FILTERS[category];
    if (newFilter) {
      setFilters(prev => ({ ...prev, ...newFilter }));
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
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="w-[300px] pl-10"
              />
            </div>
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>

        {/* Category Filters */}
        <div className="mb-4 mt-4 flex items-center gap-2">
          <Button
            variant={selectedCategory === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('all')}
            className={cn(
              'h-8 px-4',
              selectedCategory === 'all'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            All
          </Button>
          <Button
            variant={selectedCategory === 'agents' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('agents')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'agents'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            <Bot className="h-3.5 w-3.5" />
            Agents
          </Button>
          <Button
            variant={selectedCategory === 'mcp' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('mcp')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'mcp'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            <Server className="h-3.5 w-3.5" />
            MCPs
          </Button>
          <Button
            variant={selectedCategory === 'demo' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('demo')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'demo'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            <SquarePlay className="h-3.5 w-3.5" />
            Demos
          </Button>
          <Button
            variant={selectedCategory === 'services' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('services')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'services'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            <Server className="h-3.5 w-3.5" />
            Services
          </Button>
          <Button
            variant={selectedCategory === 'installed' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('installed')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'installed'
                ? ''
                : 'text-muted-foreground hover:text-foreground',
            )}>
            <CheckCircle className="h-3.5 w-3.5" />
            Installed
          </Button>
        </div>

        {/* Loading state */}
        {isPending && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {/* Marketplace Items Grid */}
        {!isPending && data && data.items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentItems.map(item => (
              <MarketplaceItemCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isPending && data && data.items.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No marketplace items found</p>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} items
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
