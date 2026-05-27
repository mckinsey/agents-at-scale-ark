'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Add, BarChart, Search, SwapVert } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { SessionTableRow } from './session-table-row';
import { NewSessionDialog } from './new-session-dialog';

interface Props {
  readonly onSelectSession: (sessionId: string) => void;
  readonly selectedSessionId: string | null;
}

type SortField = 'date' | 'name' | 'conversations';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 20;

export function SessionsTable({ onSelectSession, selectedSessionId }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'' | '24h' | '7d' | '30d'>('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, 400);

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
    if (!dateFilter) return undefined;
    const now = new Date();
    if (dateFilter === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return undefined;
  }, [dateFilter]);

  const { data, isLoading, isError, error } = useListSessions({
    limit: PAGE_SIZE,
    cursor: (currentPage - 1) * PAGE_SIZE,
    status: statusFilter === 'all' ? undefined : statusFilter,
    dateFrom,
    search: debouncedSearch || undefined,
    sort: sortField,
    order: sortDirection,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error('Failed to load sessions', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [isError, error]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, dateFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
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
    <div className="flex min-h-0 flex-1 flex-col gap-6">
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
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <IconShell size="sm" variant="secondary">
              <Search />
            </IconShell>
          </div>
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-10 placeholder:text-fg-tertiary"
          />
        </div>
        <div className="flex w-48 flex-col gap-2">
          <span className="text-sm leading-5 text-fg-secondary">Date range</span>
          <Select items={dateRangeItems} value={dateFilter} onValueChange={(value) => setDateFilter(value as typeof dateFilter)}>
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
          <Select items={statusItems} value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
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
        <Button onClick={() => setDialogOpen(true)} className="h-9">
          <IconShell size="sm">
            <Add />
          </IconShell>
          New session
        </Button>
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
          <div className="border-b border-stroke-tertiary h-12 flex items-center px-3">Participants</div>
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
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      <NewSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
