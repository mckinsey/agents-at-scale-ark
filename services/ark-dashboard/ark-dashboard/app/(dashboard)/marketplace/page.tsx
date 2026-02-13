'use client';

import { Package, Search } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { MarketplaceSection } from '@/components/sections/marketplace-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  MarketplaceCategory,
  MarketplaceFilters,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';

export default function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setFilters(prev => ({
      ...prev,
      search: value || undefined,
    }));
  };

  const handleCategoryChange = (value: string) => {
    setFilters(prev => ({
      ...prev,
      category: value === 'all' ? undefined : (value as MarketplaceCategory),
    }));
  };

  const handleTypeChange = (value: string) => {
    setFilters(prev => ({
      ...prev,
      type: value === 'all' ? undefined : (value as MarketplaceItemType),
    }));
  };

  const handleFeaturedToggle = (value: string) => {
    setFilters(prev => ({
      ...prev,
      featured: value === 'featured' ? true : undefined,
    }));
  };

  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage="Marketplace" />
      <main className="container space-y-8 p-6 py-8">
        <section>
          <div className="flex items-center gap-3">
            <Package className="text-primary h-8 w-8" />
            <div>
              <h2 className="text-3xl font-bold">Marketplace</h2>
              <p className="text-muted-foreground">
                Explore and install extensions, tools, and integrations for Ark
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={filters.category || 'all'}
                onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="observability">Observability</SelectItem>
                  <SelectItem value="tools">Tools</SelectItem>
                  <SelectItem value="mcp-servers">MCP Servers</SelectItem>
                  <SelectItem value="agents">Agents</SelectItem>
                  <SelectItem value="models">Models</SelectItem>
                  <SelectItem value="workflows">Workflows</SelectItem>
                  <SelectItem value="integrations">Integrations</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.type || 'all'}
                onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="component">Component</SelectItem>
                  <SelectItem value="template">Template</SelectItem>
                  <SelectItem value="plugin">Plugin</SelectItem>
                </SelectContent>
              </Select>

              <ToggleGroup
                type="single"
                value={filters.featured ? 'featured' : 'all'}
                onValueChange={handleFeaturedToggle}>
                <ToggleGroupItem value="all" aria-label="Show all items">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="featured"
                  aria-label="Show featured items only">
                  Featured
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </section>

        <MarketplaceSection
          filters={filters}
          showHeader={false}
          limit={undefined}
        />
      </main>
    </div>
  );
}
