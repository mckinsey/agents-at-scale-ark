'use client';

import { Filter, Search, Users } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { MarketplaceSection } from '@/components/sections/marketplace-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  MarketplaceCategory,
  MarketplaceFilters,
  MarketplaceItemType,
} from '@/lib/api/generated/marketplace-types';
import { cn } from '@/lib/utils';

export default function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'public' | 'internal'>(
    'public',
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setFilters(prev => ({
      ...prev,
      search: value || undefined,
    }));
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (category === 'all') {
      setFilters(prev => ({
        ...prev,
        category: undefined,
        type: undefined,
      }));
    } else if (category === 'agents') {
      setFilters(prev => ({
        ...prev,
        category: 'agents' as MarketplaceCategory,
        type: undefined,
      }));
    } else if (category === 'workflow') {
      setFilters(prev => ({
        ...prev,
        category: 'workflows' as MarketplaceCategory,
        type: undefined,
      }));
    } else if (category === 'services') {
      setFilters(prev => ({
        ...prev,
        category: undefined,
        type: 'service' as MarketplaceItemType,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader currentPage="Marketplace" />
      <main className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Marketplace</h1>
        </div>

        {/* Tabs and Search */}
        <div className="mb-8 flex items-center justify-between">
          <Tabs
            value={selectedTab}
            onValueChange={v => setSelectedTab(v as 'public' | 'internal')}>
            <TabsList className="bg-gray-900">
              <TabsTrigger value="public" className="flex items-center gap-2">
                Public <span className="text-gray-500">(6)</span>
              </TabsTrigger>
              <TabsTrigger value="internal" className="flex items-center gap-2">
                Internal <span className="text-gray-500">(1)</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="search"
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="w-[300px] border-gray-800 bg-gray-900 pl-10 text-white placeholder-gray-500"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="border-gray-800 bg-gray-900 text-gray-400">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="mb-8 flex items-center gap-2">
          <Button
            variant={selectedCategory === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('all')}
            className={cn(
              'h-8 px-4',
              selectedCategory === 'all'
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'text-gray-400 hover:bg-gray-900 hover:text-white',
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
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'text-gray-400 hover:bg-gray-900 hover:text-white',
            )}>
            <Users className="h-3.5 w-3.5" />
            Agents
          </Button>
          <Button
            variant={selectedCategory === 'workflow' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('workflow')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'workflow'
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'text-gray-400 hover:bg-gray-900 hover:text-white',
            )}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M2 4h12M4 8h8M6 12h4"
              />
            </svg>
            Workflow
          </Button>
          <Button
            variant={selectedCategory === 'services' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => handleCategoryChange('services')}
            className={cn(
              'flex h-8 items-center gap-1.5 px-4',
              selectedCategory === 'services'
                ? 'bg-gray-800 text-white hover:bg-gray-700'
                : 'text-gray-400 hover:bg-gray-900 hover:text-white',
            )}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
              <rect
                x="2"
                y="2"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="9"
                y="2"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="2"
                y="9"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="9"
                y="9"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            Services
          </Button>
        </div>

        {/* Marketplace Items */}
        <MarketplaceSection
          filters={filters}
          showHeader={false}
          limit={undefined}
        />
      </main>
    </div>
  );
}
