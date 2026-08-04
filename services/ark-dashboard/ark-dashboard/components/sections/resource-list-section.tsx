'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from '@/components/ui/sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import {
  ResourceEmptyState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Page } from '@/lib/api/pagination';
import { useDelayedLoading } from '@/lib/hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

type StatusFilter = 'All' | 'True' | 'False';

const STATUS_ITEMS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'True', label: 'Active' },
  { value: 'False', label: 'Error' },
];

export interface ResourceListItem {
  id: string;
  name: string;
  description?: string | null;
  available?: string | null;
}

export interface ResourceListFilter<T extends ResourceListItem> {
  readonly label: string;
  readonly getValue: (item: T) => string;
}

/**
 * Page loader contract: given the previous page's `continueToken` (or `null`
 * for the first page), return the next page plus the token for the *next*
 * call (or `null` to signal there are no more pages). Uses the shared
 * `Page<T>` shape from `@/lib/api/pagination` so services can pass their
 * `getPage` methods directly without an adapter.
 */
export type ResourceListPageLoader<T> = (
  continueToken: string | null,
) => Promise<Page<T>>;

interface ResourceListSectionProps<T extends ResourceListItem> {
  /** Raw icon element (e.g. <Group />); wrapped in IconShell internally. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly showCount?: boolean;
  readonly subtitle: string;
  readonly createHref: string;
  readonly createLabel: string;
  readonly learnMoreUrl: string;
  /** Capitalised singular for toasts, e.g. "Team" or "Agent". */
  readonly entityLabel: string;
  /** Lowercase plural for filter messages, e.g. "agents" or "MCP servers". */
  readonly entityPluralLabel?: string;
  readonly emptyTitle: string;
  readonly emptyDescription: ReactNode;
  readonly headerActions?: ReactNode;
  readonly originFilter?: ResourceListFilter<T>;
  /**
   * Fetch one page at a time. The section owns the accumulation and
   * continuation-token lifecycle; sections just answer "give me the next page".
   */
  readonly loadPage: ResourceListPageLoader<T>;
  readonly deleteItem: (id: string) => Promise<unknown>;
  readonly renderTable: (
    items: T[],
    onDelete: (id: string) => void,
    reload: () => void,
  ) => ReactNode;
}

export function ResourceListSection<T extends ResourceListItem>({
  icon,
  title,
  showCount,
  subtitle,
  createHref,
  createLabel,
  learnMoreUrl,
  entityLabel,
  entityPluralLabel,
  emptyTitle,
  emptyDescription,
  headerActions,
  originFilter,
  loadPage,
  deleteItem,
  renderTable,
}: ResourceListSectionProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  // `null` before the first successful load. After that: `string` if more
  // pages remain, `null` again once we've reached the end.
  const [continueToken, setContinueToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [originFilterValue, setOriginFilterValue] = useState('All');
  const showLoading = useDelayedLoading(loading);
  const { readOnlyMode, namespace } = useNamespace();

  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  // Guards against overlapping auto-fetches when the user is typing quickly.
  const autoFetchingRef = useRef(false);

  const originFilterOptions = useMemo(() => {
    if (!originFilter) return [];
    const values = new Set<string>();
    for (const item of items) {
      values.add(originFilter.getValue(item));
    }
    return ['All', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [originFilter, items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter(item => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        statusFilter === 'All' ||
        (item.available ?? 'Unknown') === statusFilter;
      const matchesOrigin =
        !originFilter ||
        originFilterValue === 'All' ||
        originFilter.getValue(item) === originFilterValue;
      return matchesSearch && matchesStatus && matchesOrigin;
    });
  }, [items, searchQuery, statusFilter, originFilter, originFilterValue]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await loadPageRef.current(null);
      setItems(page.items);
      setContinueToken(page.continueToken);
      setHasMore(page.continueToken !== null);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to Load Data', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!continueToken || loadingMore) return null;
    setLoadingMore(true);
    try {
      const page = await loadPageRef.current(continueToken);
      setItems(prev => [...prev, ...page.items]);
      setContinueToken(page.continueToken);
      setHasMore(page.continueToken !== null);
      return page;
    } catch (error) {
      console.error('Failed to load more:', error);
      toast.error('Failed to Load More', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
      return null;
    } finally {
      setLoadingMore(false);
    }
  }, [continueToken, loadingMore]);

  useEffect(() => {
    reload();
  }, [namespace, reload]);

  // Search-with-pagination trade-off: filtering only works over items already
  // loaded. When the user types with more pages available, walk the rest of
  // the collection in the background so the filter reflects everything. This
  // hits ark-api harder than the "load more" flow, but only when the user
  // actively searches — the common browse case still paginates on demand.
  useEffect(() => {
    if (!searchQuery.trim() || !hasMore || autoFetchingRef.current) return;

    let cancelled = false;
    autoFetchingRef.current = true;

    (async () => {
      let token: string | null = continueToken;
      try {
        while (!cancelled && token) {
          const page = await loadPageRef.current(token);
          if (cancelled) return;
          setItems(prev => [...prev, ...page.items]);
          setContinueToken(page.continueToken);
          setHasMore(page.continueToken !== null);
          token = page.continueToken;
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to auto-load for search:', error);
          toast.error('Search Incomplete', {
            description:
              error instanceof Error
                ? error.message
                : 'Some results may be missing',
          });
        }
      } finally {
        autoFetchingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      autoFetchingRef.current = false;
    };
  }, [searchQuery, hasMore, continueToken]);

  const handleDelete = async (id: string) => {
    try {
      const item = items.find(i => i.id === id);
      if (!item) {
        throw new Error(`${entityLabel} not found`);
      }
      await deleteItem(id);
      toast.success(`${entityLabel} deleted successfully`);
      await reload();
    } catch (error) {
      toast.error(`Failed to Delete ${entityLabel}`, {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const isEmpty = !loading && items.length === 0;

  const pluralLabel = entityPluralLabel ?? `${entityLabel.toLowerCase()}s`;
  const statusLabel = STATUS_ITEMS.find(s => s.value === statusFilter)?.label;
  const noResultsMessage =
    statusFilter === 'All'
      ? `No ${pluralLabel} match your search.`
      : `There are no ${statusLabel} ${pluralLabel} at the moment.`;

  return (
    <div className="flex h-full w-full content-shell flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              {icon}
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              {showCount && items.length > 0
                ? `${title} (${items.length}${hasMore ? '+' : ''})`
                : title}
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            {subtitle}
          </p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-3">
            {headerActions}
            {readOnlyMode ? (
              <Button disabled>{createLabel}</Button>
            ) : (
              <NamespacedLink href={createHref}>
                <Button>{createLabel}</Button>
              </NamespacedLink>
            )}
          </div>
        )}
      </div>

      {showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      )}
      {!showLoading && isEmpty && (
        <ResourceEmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          actions={
            <>
              {readOnlyMode ? (
                <Button disabled>{createLabel}</Button>
              ) : (
                <NamespacedLink href={createHref}>
                  <Button>{createLabel}</Button>
                </NamespacedLink>
              )}
              <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Learn more</Button>
              </a>
            </>
          }
        />
      )}
      {!showLoading && !isEmpty && (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          <div className="flex flex-none items-end gap-3">
            <ResourceSearchInput value={searchQuery} onChange={setSearchQuery} />
            {originFilter && (
              <div className="flex w-48 flex-col gap-2">
                <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
                  {originFilter.label}
                </span>
                <Select
                  items={originFilterOptions.map(value => ({
                    value,
                    label: value,
                  }))}
                  value={originFilterValue}
                  onValueChange={value => setOriginFilterValue(String(value))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {originFilterOptions.map(value => (
                      <SelectItem key={value} value={value}>
                        <SelectItemText>{value}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex w-48 flex-col gap-2">
              <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
                Status
              </span>
              <Select
                items={STATUS_ITEMS}
                value={statusFilter}
                onValueChange={v => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ITEMS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      <SelectItemText>{item.label}</SelectItemText>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <ResourceNoResults icon={icon} message={noResultsMessage} />
          ) : (
            <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              {renderTable(filteredItems, handleDelete, reload)}
              {/* Hidden while searching: the effect above is already walking
                  every remaining page in the background so the filter has
                  the full set. */}
              {hasMore && !searchQuery.trim() && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : `Load more ${pluralLabel}`}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
