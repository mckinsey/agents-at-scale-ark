'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EventTypeIndicator } from '@/components/common/event-type-indicator';
import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Autorenew, Poll, Warning } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceNoResults,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Pagination } from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { type Event, eventsService } from '@/lib/services/events';
import { cn } from '@/lib/utils';
import { formatAge } from '@/lib/utils/time';

const COL = {
  added: 'w-[100px]',
  type: 'w-[110px]',
  reason: 'w-[170px]',
  object: 'w-[220px]',
  subobject: 'w-[130px]',
  source: 'w-[150px]',
  message: 'w-auto',
  count: 'w-[80px]',
};

const ALL = 'all';

interface EventsSectionProps {
  readonly page: number;
  readonly limit: number;
  readonly type?: string;
  readonly kind?: string;
  readonly name?: string;
  readonly totalCount?: number;
}

interface EventsFilterProps {
  readonly label: string;
  readonly value: string;
  readonly allLabel: string;
  readonly options: string[];
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

function EventsFilter({
  label,
  value,
  allLabel,
  options,
  onChange,
  className,
}: Readonly<EventsFilterProps>) {
  const items = [
    { value: ALL, label: allLabel },
    ...options.map(option => ({ value: option, label: option })),
  ];

  return (
    <div className={cn('flex w-48 flex-col gap-2', className)}>
      <span className="label-regular-primary text-fg-secondary">{label}</span>
      <Select
        items={items}
        value={value}
        onValueChange={next => onChange(String(next))}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          {items.map(item => (
            <SelectItem key={item.value} value={item.value}>
              <SelectItemText>{item.label}</SelectItemText>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function EventsTableSkeleton() {
  return (
    <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
      <div className="flex flex-none items-end gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div
        className="flex flex-col gap-1 pt-2"
        aria-busy="true"
        aria-label="Loading events">
        {SKELETON_ROWS.map(row => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EventsSection({
  page,
  limit,
  type,
  kind,
  name,
  totalCount,
}: EventsSectionProps) {
  const { namespace } = useNamespace();
  const router = useRouter();
  const { push: namespacedPush } = useNamespacedNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Component state (not for filters!)
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableKinds, setAvailableKinds] = useState<string[]>([]);
  const [availableNames, setAvailableNames] = useState<string[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track last loaded filters to prevent double loading
  const lastLoadedFilters = useRef<string>('');

  // Load events based on URL params
  const loadEvents = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);
      setLoadError(null);

      try {
        // Build filters from current URL params
        const filters = {
          page,
          limit,
          type,
          kind,
          name,
        };

        // Always load filter options from ALL events to get complete lists
        const filterOptions = await eventsService.getAllFilterOptions(namespace);

        // Then load filtered events based on current filters
        const eventsData = await eventsService.getAll(namespace, filters);

        setEvents(eventsData.items);
        setTotalEvents(eventsData.total);

        // Store all filter options
        setAvailableTypes(filterOptions.types);
        setAvailableKinds(filterOptions.kinds);

        // If a kind is selected, filter names to only show names from that kind
        if (kind) {
          // Need to get all events to properly filter names by kind
          const allEventsData = await eventsService.getAll(namespace, {
            kind: kind,
            limit: 1000, // Get more events to find all names for this kind
          });
          const filteredNames = new Set(
            allEventsData.items
              .filter(e => e.involvedObjectKind === kind)
              .map(e => e.involvedObjectName)
              .filter(Boolean),
          );
          setAvailableNames(Array.from(filteredNames).sort());
        } else {
          setAvailableNames(filterOptions.names);
        }
      } catch (error) {
        console.error('Failed to load events:', error);
        const description =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred';
        setLoadError(description);
        toast.error('Failed to Load Events', { description });
      } finally {
        setLoading(false);
        if (showRefreshing) setRefreshing(false);
      }
    },
    // Depend on individual URL params, not objects
    [page, limit, type, kind, name],
  );

  // Load events when URL params change
  useEffect(() => {
    // Create a filter string to compare
    const filterString = JSON.stringify({ page, limit, type, kind, name });

    // Only load if filters have actually changed
    if (lastLoadedFilters.current !== filterString) {
      lastLoadedFilters.current = filterString;
      loadEvents();
    }
  }, [loadEvents, page, limit, type, kind, name]);

  // Create query string helper
  const createQueryString = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      return params.toString();
    },
    [searchParams],
  );

  // User interaction handlers
  const handleFilterChange = (key: string, value: string | undefined) => {
    const effectiveValue = value === ALL ? undefined : value;

    // Only update the changed filter and reset page
    const params: Record<string, string | undefined> = {
      [key]: effectiveValue,
      page: '1', // Reset to first page on filter change
    };

    // If changing the kind filter and it's actually different, also clear name
    if (key === 'kind' && effectiveValue !== kind) {
      params.name = undefined; // Explicitly clear name when kind changes
    }

    const queryString = createQueryString(params);
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const handlePageChange = (newPage: number) => {
    // Only update the page parameter, leave everything else as-is
    const queryString = createQueryString({ page: newPage.toString() });
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const handleItemsPerPageChange = (newLimit: number) => {
    // Only update limit and reset page, leave filters as-is
    const queryString = createQueryString({
      limit: newLimit.toString(),
      page: '1', // Reset to first page on limit change
    });
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const clearFilters = () => {
    const queryString = createQueryString({
      type: undefined,
      kind: undefined,
      name: undefined,
      page: '1',
      limit: limit.toString(),
    });
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const handleRowClick = (event: Event, target: EventTarget | null) => {
    // Let the row's own link handle its clicks, and never navigate out from
    // under someone who is selecting message text.
    if (target instanceof HTMLElement && target.closest('a')) return;
    if (globalThis.getSelection()?.toString()) return;
    namespacedPush(`/event/${encodeURIComponent(event.name)}`);
  };

  const totalPages = Math.max(1, Math.ceil(totalEvents / limit));
  const hasFilters = Boolean(type || kind || name);
  const showSkeleton = loading || (refreshing && events.length === 0);
  const isEmpty =
    !showSkeleton &&
    !loadError &&
    events.length === 0 &&
    totalEvents === 0 &&
    !hasFilters;

  const refreshButton = (
    <Button
      variant="outline"
      onClick={() => loadEvents(true)}
      disabled={refreshing}>
      <IconShell size="sm">
        <Autorenew className={cn(refreshing && 'animate-spin')} />
      </IconShell>
      Refresh
    </Button>
  );

  const header = (
    <ResourcePageHeader
      icon={<Poll />}
      title={totalCount === undefined ? 'Events' : `Events (${totalCount})`}
      description="Track platform operational activity across the ecosystem"
      actions={refreshButton}
    />
  );

  if (showSkeleton) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {header}
        <EventsTableSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {header}
        <ResourceEmptyState
          icon={<Poll />}
          title="No events yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any event yet.</p>
              <p>Get started to see events.</p>
            </>
          }
          actions={<LearnMoreButton href={DOCS_URLS.events} />}
        />
      </div>
    );
  }

  return (
    <div className="content-shell flex h-full w-full flex-col">
      {header}

      <div className="mt-5 flex min-h-0 w-full flex-1 flex-col gap-2">
        <div className="flex flex-none items-end gap-3">
          <EventsFilter
            label="Names"
            value={name || ALL}
            allLabel="All"
            options={availableNames}
            onChange={value => handleFilterChange('name', value)}
          />
          <EventsFilter
            label="Types"
            value={type || ALL}
            allLabel="All"
            options={availableTypes}
            onChange={value => handleFilterChange('type', value)}
          />
          <EventsFilter
            label="Kinds"
            value={kind || ALL}
            allLabel="All"
            options={availableKinds}
            onChange={value => handleFilterChange('kind', value)}
          />
          <Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
            Clear filters
          </Button>
        </div>

        {loadError && (
          <div
            role="alert"
            className="border-status-error/30 bg-status-error/10 flex flex-none items-start gap-2 border px-3 py-2">
            <IconShell size="sm" className="text-fg-error mt-0.5 shrink-0">
              <Warning />
            </IconShell>
            <p className="label-regular-primary text-fg-error">
              Couldn&apos;t refresh events: {loadError}
            </p>
          </div>
        )}

        {events.length === 0 ? (
          !loadError && (
            <ResourceNoResults
              icon={<Poll />}
              message={
                hasFilters
                  ? 'No events match your filters.'
                  : 'No events on this page.'
              }
            />
          )
        ) : (
          <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <Table className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
              <TableHeader>
                <TableRow>
                  <TableHead size="small" className={COL.added}>
                    Added
                  </TableHead>
                  <TableHead size="small" className={COL.type}>
                    Type
                  </TableHead>
                  <TableHead size="small" className={COL.reason}>
                    Reason
                  </TableHead>
                  <TableHead size="small" className={COL.object}>
                    Object
                  </TableHead>
                  <TableHead size="small" className={COL.subobject}>
                    Subobject
                  </TableHead>
                  <TableHead size="small" className={COL.source}>
                    Source
                  </TableHead>
                  <TableHead size="small" className={COL.message}>
                    Message
                  </TableHead>
                  <TableHead size="small" className={cn(COL.count, 'text-right')}>
                    Count
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(event => {
                  const object = `${event.involvedObjectKind}/${event.involvedObjectName}`;
                  const source = event.sourceHost
                    ? `${event.sourceComponent} (${event.sourceHost})`
                    : event.sourceComponent;
                  const age = formatAge(event.creationTimestamp);
                  return (
                    <TableRow
                      key={event.name}
                      onClick={clickEvent =>
                        handleRowClick(event, clickEvent.target)
                      }
                      className="relative isolate cursor-pointer transition-colors">
                      <TableCell size="small" className={COL.added}>
                        <span aria-hidden className={rowHoverOverlayClass} />
                        <TruncatedTooltip label={age}>
                          <NamespacedLink
                            href={`/event/${encodeURIComponent(event.name)}`}
                            aria-label={`${age} — ${event.reason} on ${object}`}
                            className="text-fg-primary block w-full truncate">
                            {age}
                          </NamespacedLink>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell size="small" className={COL.type}>
                        <EventTypeIndicator type={event.type} />
                      </TableCell>
                      <TableCell size="small" className={COL.reason}>
                        <TruncatedTooltip label={event.reason}>
                          <span className="text-fg-primary block w-full truncate">
                            {event.reason}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell
                        size="small"
                        className={COL.object}>
                        <TruncatedTooltip label={object}>
                          <span className="text-fg-primary block w-full truncate">
                            {object}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell size="small" className={COL.subobject}>
                        <span className="text-fg-primary block truncate">-</span>
                      </TableCell>
                      <TableCell
                        size="small"
                        className={COL.source}>
                        <TruncatedTooltip label={source}>
                          <span className="text-fg-primary block w-full truncate">
                            {source}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell
                        size="small"
                        className={COL.message}>
                        <TruncatedTooltip
                          label={event.message}
                          contentClassName="max-w-[420px] break-all">
                          <span className="text-fg-primary block w-full truncate">
                            {event.message}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell
                        size="small"
                        className={cn(COL.count, 'text-right')}>
                        <span className="text-fg-primary block truncate">
                          {event.count}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {totalEvents > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            itemsPerPage={limit}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        )}
      </div>
    </div>
  );
}
