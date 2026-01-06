'use client';

import { Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  MarketplaceFilters as Filters,
  MarketplaceItem,
} from '@/lib/types/marketplace';

interface MarketplaceSidebarProps {
  items: MarketplaceItem[];
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

const ITEM_TYPES = [
  { value: 'agent', label: 'Agents' },
  { value: 'executor', label: 'Executors' },
  { value: 'service', label: 'Services' },
  { value: 'team', label: 'Teams' },
  { value: 'tool', label: 'Tools' },
];

const INSTALLED_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'installed', label: 'Installed' },
  { value: 'not-installed', label: 'Not Installed' },
];

export function MarketplaceSidebar({
  items,
  filters,
  onFilterChange,
}: MarketplaceSidebarProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(item => {
      if (item.category) {
        cats.add(item.category);
      }
    });
    return Array.from(cats).sort();
  }, [items]);

  const sources = useMemo(() => {
    const srcs = new Set<string>();
    items.forEach(item => {
      if (item.source) {
        srcs.add(item.source);
      }
    });
    return Array.from(srcs).sort();
  }, [items]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    items.forEach(item => {
      if (item.type) {
        types.add(item.type);
      }
    });
    return ITEM_TYPES.filter(t => types.has(t.value));
  }, [items]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      const timeoutId = setTimeout(() => {
        onFilterChange({ ...filters, search: value || undefined });
      }, 300);
      return () => clearTimeout(timeoutId);
    },
    [filters, onFilterChange],
  );

  const handleTypeToggle = useCallback(
    (type: string, checked: boolean) => {
      const currentTypes = filters.types || [];
      let newTypes: string[];
      if (checked) {
        newTypes = [...currentTypes, type];
      } else {
        newTypes = currentTypes.filter(t => t !== type);
      }
      onFilterChange({
        ...filters,
        types: newTypes.length > 0 ? newTypes : undefined,
      });
    },
    [filters, onFilterChange],
  );

  const handleCategoryToggle = useCallback(
    (category: string, checked: boolean) => {
      const currentCategories = filters.categories || [];
      let newCategories: string[];
      if (checked) {
        newCategories = [...currentCategories, category];
      } else {
        newCategories = currentCategories.filter(c => c !== category);
      }
      onFilterChange({
        ...filters,
        categories: newCategories.length > 0 ? newCategories : undefined,
      });
    },
    [filters, onFilterChange],
  );

  const handleSourceToggle = useCallback(
    (source: string, checked: boolean) => {
      const currentSources = filters.sources || [];
      let newSources: string[];
      if (checked) {
        newSources = [...currentSources, source];
      } else {
        newSources = currentSources.filter(s => s !== source);
      }
      onFilterChange({
        ...filters,
        sources: newSources.length > 0 ? newSources : undefined,
      });
    },
    [filters, onFilterChange],
  );

  const handleInstalledChange = useCallback(
    (value: string) => {
      let installed: boolean | undefined;
      if (value === 'installed') {
        installed = true;
      } else if (value === 'not-installed') {
        installed = false;
      }
      onFilterChange({ ...filters, installed });
    },
    [filters, onFilterChange],
  );

  const clearFilters = useCallback(() => {
    setSearchValue('');
    onFilterChange({});
  }, [onFilterChange]);

  const hasFilters =
    (filters.categories && filters.categories.length > 0) ||
    (filters.types && filters.types.length > 0) ||
    (filters.sources && filters.sources.length > 0) ||
    filters.search ||
    filters.installed !== undefined;

  const installedValue =
    filters.installed === true
      ? 'installed'
      : filters.installed === false
        ? 'not-installed'
        : 'all';

  return (
    <div className="flex h-full w-64 flex-col border-r">
      <div className="border-b p-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search..."
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6">
          {availableTypes.length > 0 && (
            <div>
              <h4 className="text-foreground mb-3 text-sm font-semibold">
                Type
              </h4>
              <div className="space-y-2">
                {availableTypes.map(type => (
                  <div key={type.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`type-${type.value}`}
                      checked={filters.types?.includes(type.value) || false}
                      onCheckedChange={checked =>
                        handleTypeToggle(type.value, checked)
                      }
                    />
                    <Label
                      htmlFor={`type-${type.value}`}
                      className="text-sm font-normal">
                      {type.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {categories.length > 0 && (
            <div>
              <h4 className="text-foreground mb-3 text-sm font-semibold">
                Category
              </h4>
              <div className="space-y-2">
                {categories.map(category => (
                  <div key={category} className="flex items-center gap-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={filters.categories?.includes(category) || false}
                      onCheckedChange={checked =>
                        handleCategoryToggle(category, checked)
                      }
                    />
                    <Label
                      htmlFor={`category-${category}`}
                      className="text-sm font-normal">
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <div>
              <h4 className="text-foreground mb-3 text-sm font-semibold">
                Source
              </h4>
              <div className="space-y-2">
                {sources.map(source => (
                  <div key={source} className="flex items-center gap-2">
                    <Checkbox
                      id={`source-${source}`}
                      checked={filters.sources?.includes(source) || false}
                      onCheckedChange={checked =>
                        handleSourceToggle(source, checked)
                      }
                    />
                    <Label
                      htmlFor={`source-${source}`}
                      className="text-sm font-normal">
                      {source}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-foreground mb-3 text-sm font-semibold">
              Status
            </h4>
            <div className="space-y-2">
              {INSTALLED_OPTIONS.map(option => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${option.value}`}
                    checked={installedValue === option.value}
                    onCheckedChange={checked => {
                      if (checked) {
                        handleInstalledChange(option.value);
                      }
                    }}
                  />
                  <Label
                    htmlFor={`status-${option.value}`}
                    className="text-sm font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasFilters && (
        <div className="border-t p-4">
          <button
            onClick={clearFilters}
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 text-sm">
            <X className="h-4 w-4" />
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
