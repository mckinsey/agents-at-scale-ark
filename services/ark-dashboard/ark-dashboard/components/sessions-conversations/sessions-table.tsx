'use client';

import { useEffect, useMemo } from 'react';
import { toast } from '@/components/ui/sonner';

import { BarChart, SwapVert } from '@/components/icons';
import { ResourceSearchInput } from '@/components/sections/resource-list-states';
import { IconShell } from '@/components/ui/icon-shell';
import { Pagination } from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import { SEARCH_DEBOUNCE_MS, useUrlState } from '@/lib/hooks/use-url-state';
import type { SortDirection } from '@/lib/hooks/use-value-sort';
import { parsePage } from '@/lib/utils/pagination';

import { SessionTableRow } from './session-table-row';

interface Props {
  readonly onSelectSession: (sessionId: string) => void;
  readonly selectedSessionId: string | null;
}

type SortField = 'date' | 'name' | 'conversations';
type StatusFilter = 'all' | 'active' | 'idle' | 'error';
type DateFilter = '' | '24h' | '7d' | '30d';

const PAGE_SIZE = 20;

const SORT_FIELDS: readonly SortField[] = ['date', 'name', 'conversations'];
const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'active',
  'idle',
  'error',
];
const DATE_FILTERS: readonly DateFilter[] = ['', '24h', '7d', '30d'];

function parseSortField(raw: string): SortField {
  return SORT_FIELDS.find(field => field === raw) ?? 'date';
}

function parseSortDirection(raw: string): SortDirection {
  return raw === 'asc' ? 'asc' : 'desc';
}

function parseStatusFilter(raw: string): StatusFilter {
  return STATUS_FILTERS.find(status => status === raw) ?? 'all';
}

function parseDateFilter(raw: string): DateFilter {
  return DATE_FILTERS.find(range => range === raw) ?? '';
}

const URL_STATE_SPEC = {
  q: { default: '', debounceMs: SEARCH_DEBOUNCE_MS },
  status: { default: 'all', parse: parseStatusFilter },
  date: { default: '', parse: parseDateFilter },
  sort: { default: 'date', parse: parseSortField },
  order: { default: 'desc', parse: parseSortDirection },
  page: { default: 1, parse: parsePage },
};

export function SessionsTable({ onSelectSession, selectedSessionId }: Props) {
  const [filters, setFilters, committedFilters] = useUrlState(URL_STATE_SPEC);

  const dateRangeItems = [
    { value: '', label: 'Choose option' },
    { value: '24h', label: 'Last 24h' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
  ];

  const statusItems = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'idle', label: 'Idle' },
    { value: 'error', label: 'Error' },
  ];

  const dateFrom = useMemo(() => {
    if (!filters.date) return undefined;
    const now = new Date();
    if (filters.date === '24h')
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (filters.date === '7d')
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (filters.date === '30d')
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return undefined;
  }, [filters.date]);

  const { data, isLoading, isError, error } = useListSessions({
    limit: PAGE_SIZE,
    cursor: (filters.page - 1) * PAGE_SIZE,
    status: filters.status === 'all' ? undefined : filters.status,
    dateFrom,
    search: committedFilters.q || undefined,
    sort: filters.sort,
    order: filters.order,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error('Failed to load sessions', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [isError, error]);

  const toggleSort = (field: SortField) => {
    if (filters.sort === field) {
      setFilters({ order: filters.order === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilters({ sort: field, order: 'desc' });
    }
  };

  const sessions = data?.items || [];
  const totalSessions = data?.total || 0;
  const activeSessions = data?.statusCounts?.active ?? 0;
  const errorSessions = data?.statusCounts?.error ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE));

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96 flex-1" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full content-shell flex-1 flex-col gap-6">
      <div className="flex w-full flex-col items-start gap-5 border border-stroke-tertiary bg-surface-bg-secondary p-5">
        <div className="inline-flex items-center gap-3">
          <div className="flex items-end gap-6">
            <div className="flex items-center gap-2">
              <IconShell size="sm" variant="secondary">
                <BarChart />
              </IconShell>
              <div className="flex items-center gap-1">
                <span className="text-base font-semibold leading-6 text-fg-primary">{totalSessions}</span>
                <span className="text-sm leading-5 text-fg-secondary">Sessions</span>
              </div>
            </div>
            <div className="h-5 w-px border-r border-stroke-tertiary" />
            <div className="flex items-center gap-2">
              <div className="relative size-2 rounded-full bg-status-information" />
              <div className="flex items-center gap-1">
                <span className="text-base font-semibold leading-6 text-fg-primary">{activeSessions}</span>
                <span className="text-sm leading-5 text-fg-secondary">active</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative size-2 rounded-full bg-status-error" />
              <div className="flex items-center gap-1">
                <span className="text-base font-semibold leading-6 text-fg-primary">{errorSessions}</span>
                <span className="text-sm leading-5 text-fg-secondary">errors</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full items-end gap-3">
        <div className="flex items-end gap-3">
          <ResourceSearchInput
            value={filters.q}
            onChange={q => setFilters({ q })}
          />
          <div className="flex w-48 flex-col gap-2">
            <span className="text-sm leading-5 text-fg-secondary">Date range</span>
            <Select
              items={dateRangeItems}
              value={filters.date}
              onValueChange={value =>
                setFilters({ date: parseDateFilter(String(value)) })
              }>
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="Choose option" />
              </SelectTrigger>
              <SelectContent>
                {dateRangeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-48 flex-col gap-2">
            <span className="text-sm leading-5 text-fg-secondary">Status</span>
            <Select
              items={statusItems}
              value={filters.status}
              onValueChange={value =>
                setFilters({ status: parseStatusFilter(String(value)) })
              }>
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="grid grid-cols-[2fr_3fr_1fr] gap-4 text-sm text-fg-secondary">
          <button
            className="flex items-center gap-2 text-left border-b border-stroke-tertiary h-12 px-3"
            onClick={() => toggleSort('name')}
          >
            Name
            <IconShell size="sm" variant="secondary">
              <SwapVert />
            </IconShell>
          </button>
          <div className="border-b border-stroke-tertiary h-12 flex items-center px-3">Targets</div>
          <div className="text-right border-b border-stroke-tertiary h-12 flex items-center justify-end px-3">Convos</div>
        </div>

        <ScrollArea className="-mx-3 min-h-0 flex-1 px-3">
          {sessions.map((session) => (
            <SessionTableRow
              key={session.sessionId}
              session={session}
              isSelected={selectedSessionId === session.sessionId}
              onSelect={onSelectSession}
            />
          ))}

          {sessions.length === 0 && !isLoading && (
            <div className="py-12 text-center text-muted-foreground">
              No sessions found
            </div>
          )}
        </ScrollArea>

        {totalPages > 1 && (
          <div className="shrink-0 border-t border-stroke-tertiary">
            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              onPageChange={page => setFilters({ page })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
