'use client';

import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { type Event, eventsService } from '@/lib/services/events';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

interface EventsSectionProps {
  readonly page: number;
  readonly limit: number;
  readonly type?: string;
  readonly kind?: string;
  readonly name?: string;
}

export function EventsSection({
  page,
  limit,
  type,
  kind,
  name,
}: EventsSectionProps) {
  const router = useRouter();
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

  // Track last loaded filters to prevent double loading
  const lastLoadedFilters = useRef<string>('');

  // Load events based on URL params
  const loadEvents = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);

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
        const filterOptions = await eventsService.getAllFilterOptions();

        // Then load filtered events based on current filters
        const eventsData = await eventsService.getAll(filters);

        setEvents(eventsData.items);
        setTotalEvents(eventsData.total);

        // Store all filter options
        setAvailableTypes(filterOptions.types);
        setAvailableKinds(filterOptions.kinds);

        // If a kind is selected, filter names to only show names from that kind
        if (kind) {
          // Need to get all events to properly filter names by kind
          const allEventsData = await eventsService.getAll({
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
        toast.error('Failed to Load Events', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
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
    const effectiveValue = value === 'all' ? undefined : value;

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

  const handleEventClick = (event: Event) => {
    router.push(`/event/${event.name}`);
  };

  // Helper functions
  const formatAge = (timestamp: string | undefined) => {
    if (!timestamp) return '-';

    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffMs = now.getTime() - eventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return 'now';
  };

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'Warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'Normal':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case 'Warning':
        return <Badge variant="destructive">{type}</Badge>;
      case 'Normal':
        return <Badge variant="secondary">{type}</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalEvents / limit));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 border-b pb-4">
        <Select
          value={type || 'all'}
          onValueChange={value => handleFilterChange('type', value)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {availableTypes.map(t => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={kind || 'all'}
          onValueChange={value => handleFilterChange('kind', value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Object Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Kinds</SelectItem>
            {availableKinds.map(k => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={name || 'all'}
          onValueChange={value => handleFilterChange('name', value)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Resource Name" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Names</SelectItem>
            {availableNames.map(n => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          disabled={!(type || kind || name)}>
          Clear Filters
        </Button>

        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => loadEvents(true)}
            disabled={refreshing}>
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Events Table */}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Age
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Type
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Reason
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Object
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Subobject
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Source
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Message
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <DASHBOARD_SECTIONS.events.icon />
                        </EmptyMedia>
                        <EmptyTitle>No Events Yet</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </td>
                </tr>
              ) : (
                events.map(event => (
                  <tr
                    key={event.name}
                    onClick={() => handleEventClick(event)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-3 py-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatAge(event.lastTimestamp)}
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getEventTypeIcon(event.type)}
                        {getEventTypeBadge(event.type)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">
                      {event.reason}
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {event.involvedObjectKind}/
                              {event.involvedObjectName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div>Kind: {event.involvedObjectKind}</div>
                              <div>Name: {event.involvedObjectName}</div>
                              {event.involvedObjectNamespace && (
                                <div>
                                  Namespace: {event.involvedObjectNamespace}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      -
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {event.sourceComponent}
                      {event.sourceHost && ` (${event.sourceHost})`}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="max-w-md truncate" title={event.message}>
                        {event.message}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {event.count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        itemsPerPage={limit}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  );
}
