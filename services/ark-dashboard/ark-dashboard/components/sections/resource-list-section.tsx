'use client';

import { type ReactNode, useEffect, useMemo } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { NamespacedLink } from '@/components/namespaced-link';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceErrorState,
  ResourceNoResults,
  ResourceSearchInput,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useDelayedLoading } from '@/lib/hooks';
import { SEARCH_DEBOUNCE_MS, useUrlState } from '@/lib/hooks/use-url-state';
import { useNamespace } from '@/providers/NamespaceProvider';

type StatusFilter = 'All' | 'True' | 'False';

const STATUS_ITEMS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'True', label: 'Active' },
  { value: 'False', label: 'Error' },
];

function parseStatusFilter(raw: string): StatusFilter {
  const match = STATUS_ITEMS.find(item => item.value === raw);
  return match ? match.value : 'All';
}

const URL_STATE_SPEC = {
  q: { default: '', debounceMs: SEARCH_DEBOUNCE_MS },
  status: { default: 'All', parse: parseStatusFilter },
  origin: { default: 'All' },
};

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

interface ResourceListSectionProps<T extends ResourceListItem> {
  /** Raw icon element (e.g. <Group />); wrapped in IconShell internally. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly showCount?: boolean;
  readonly subtitle: string;
  /**
   * Create control rendered in the header and the empty state. Use
   * CreateResourceButton unless the resource needs something bespoke; omit it
   * for resources that cannot be created from the list.
   */
  readonly createAction?: ReactNode;
  /** Set false for resources that have no availability status to filter on. */
  readonly showStatusFilter?: boolean;
  readonly learnMoreUrl: string;
  /** Capitalised singular for toasts, e.g. "Team" or "Agent". */
  readonly entityLabel: string;
  /** Lowercase plural for filter messages, e.g. "agents" or "MCP servers". */
  readonly entityPluralLabel?: string;
  readonly emptyTitle: string;
  readonly emptyDescription: ReactNode;
  readonly headerActions?: ReactNode;
  readonly originFilter?: ResourceListFilter<T>;
  // Data is owned by the caller via React Query (fetching + caching).
  readonly items: T[];
  readonly loading: boolean;
  readonly error?: unknown;
  // React Query's dataUpdatedAt: 0 until the first successful load, so it
  // distinguishes an initial load failure from a failed refresh.
  readonly dataUpdatedAt?: number;
  readonly onDelete: (id: string) => void;
  readonly onReload: () => void;
  readonly renderTable: (
    items: T[],
    onDelete: (id: string) => void,
    reload: () => void,
  ) => ReactNode;
}

interface CreateResourceButtonProps {
  readonly label: string;
  /** Route to the create page. Omit and pass onClick for dialog-based flows. */
  readonly href?: string;
  readonly onClick?: () => void;
  readonly 'data-testid'?: string;
}

export function CreateResourceButton({
  label,
  href,
  onClick,
  'data-testid': testId,
}: Readonly<CreateResourceButtonProps>) {
  const { readOnlyMode } = useNamespace();

  if (readOnlyMode) {
    return (
      <Button disabled data-testid={testId}>
        {label}
      </Button>
    );
  }

  if (href) {
    return (
      <NamespacedLink href={href}>
        <Button data-testid={testId}>{label}</Button>
      </NamespacedLink>
    );
  }

  return (
    <Button onClick={onClick} data-testid={testId}>
      {label}
    </Button>
  );
}

export function ResourceListSection<T extends ResourceListItem>({
  icon,
  title,
  showCount,
  subtitle,
  createAction,
  showStatusFilter = true,
  learnMoreUrl,
  entityLabel,
  entityPluralLabel,
  emptyTitle,
  emptyDescription,
  headerActions,
  originFilter,
  items,
  loading,
  error,
  dataUpdatedAt,
  onDelete,
  onReload,
  renderTable,
}: ResourceListSectionProps<T>) {
  const [filters, setFilters] = useUrlState(URL_STATE_SPEC);
  const showLoading = useDelayedLoading(loading);

  const pluralLabel = entityPluralLabel ?? `${entityLabel.toLowerCase()}s`;

  useEffect(() => {
    if (!error) return;
    toast.error(`Failed to Load ${pluralLabel}`, {
      description:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }, [error, pluralLabel]);

  const originFilterOptions = useMemo(() => {
    if (!originFilter) return [];
    const values = new Set<string>();
    for (const item of items) {
      values.add(originFilter.getValue(item));
    }
    return ['All', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [originFilter, items]);

  // The options are discovered from the data, so the URL cannot be validated by
  // a parser at read time. A value that is not on offer reads as no filter
  // rather than filtering every row away.
  const originValue = originFilterOptions.includes(filters.origin)
    ? filters.origin
    : 'All';

  const filteredItems = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return items.filter(item => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description?.toLowerCase().includes(q) ?? false);
      const matchesStatus =
        !showStatusFilter ||
        filters.status === 'All' ||
        (item.available ?? 'Unknown') === filters.status;
      const matchesOrigin =
        !originFilter ||
        originValue === 'All' ||
        originFilter.getValue(item) === originValue;
      return matchesSearch && matchesStatus && matchesOrigin;
    });
  }, [
    items,
    filters.q,
    filters.status,
    originFilter,
    originValue,
    showStatusFilter,
  ]);

  // loadFailed: the first load never succeeded, so there is nothing to show —
  // the error replaces the list. refreshFailed: a later reload failed but we
  // still hold the previously loaded items — keep showing them under a banner
  // rather than discarding valid data. This mirrors the a2a-servers/events
  // sections and prevents a transient error from rendering the empty state.
  const hasError = Boolean(error);
  const hasLoadedOnce = (dataUpdatedAt ?? 0) > 0;
  const loadFailed = hasError && !hasLoadedOnce;
  const refreshFailed = hasError && hasLoadedOnce;
  const isEmpty = !loading && !hasError && items.length === 0;
  const errorMessage =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  const statusLabel = STATUS_ITEMS.find(s => s.value === filters.status)?.label;
  const noResultsMessage =
    !showStatusFilter || filters.status === 'All'
      ? `No ${pluralLabel} match your search.`
      : `There are no ${statusLabel} ${pluralLabel} at the moment.`;

  return (
    <div className="content-shell flex h-full w-full flex-col">
      <ResourcePageHeader
        icon={icon}
        title={
          showCount && items.length > 0 ? `${title} (${items.length})` : title
        }
        description={subtitle}
        actions={
          !isEmpty && (
            <>
              {headerActions}
              {createAction}
            </>
          )
        }
      />

      {showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      )}
      {!showLoading && loadFailed && (
        <ResourceErrorState
          className="mt-5"
          title={`Couldn't load ${pluralLabel}`}
          description={errorMessage}
          onRetry={onReload}
        />
      )}
      {!showLoading && !loadFailed && isEmpty && (
        <ResourceEmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          actions={
            <>
              {createAction}
              <LearnMoreButton href={learnMoreUrl} />
            </>
          }
        />
      )}
      {!showLoading && !loadFailed && !isEmpty && (
        <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
          {refreshFailed && (
            <ResourceErrorState
              title={`Couldn't refresh ${pluralLabel}`}
              description="Showing the last loaded version."
              onRetry={onReload}
            />
          )}
          <div className="flex flex-none items-end gap-3">
            <ResourceSearchInput
              value={filters.q}
              onChange={q => setFilters({ q })}
            />
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
                  value={originValue}
                  onValueChange={value =>
                    setFilters({ origin: String(value) })
                  }>
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
            {showStatusFilter && (
              <div className="flex w-48 flex-col gap-2">
                <span className="text-fg-secondary text-sm leading-5 tracking-[-0.112px]">
                  Status
                </span>
                <Select
                  items={STATUS_ITEMS}
                  value={filters.status}
                  onValueChange={v =>
                    setFilters({ status: parseStatusFilter(String(v)) })
                  }>
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
            )}
          </div>

          {filteredItems.length === 0 ? (
            <ResourceNoResults icon={icon} message={noResultsMessage} />
          ) : (
            <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              {renderTable(filteredItems, onDelete, onReload)}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
