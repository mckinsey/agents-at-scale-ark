'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, BarChart3, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import { brokerSessionsService, type BrokerSession } from '@/lib/services/broker-sessions';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { SessionTableRow } from './session-table-row';
import { NewSessionDialog } from './new-session-dialog';

interface Props {
  readonly onSelectSession: (sessionId: string) => void;
  readonly selectedSessionId: string | null;
}

type SortField = 'date' | 'name' | 'conversations';
type SortDirection = 'asc' | 'desc';

export function SessionsTable({ onSelectSession, selectedSessionId }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [additionalSessions, setAdditionalSessions] = useState<BrokerSession[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>();
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 400);

  const dateFrom = useMemo(() => {
    if (dateFilter === 'all') return undefined;
    const now = new Date();
    if (dateFilter === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return undefined;
  }, [dateFilter]);

  const { data, isLoading, isError, error } = useListSessions({
    limit: 20,
    cursor: 0,
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
    if (data) {
      setHasMoreSessions(data.hasMore);
      setNextCursor(data.nextCursor);
    }
  }, [data]);

  useEffect(() => {
    setAdditionalSessions([]);
    setNextCursor(data?.nextCursor);
    setHasMoreSessions(data?.hasMore || false);
  }, [debouncedSearch, statusFilter, dateFilter, sortField, sortDirection, data?.nextCursor, data?.hasMore]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || nextCursor === undefined) return;

    setIsLoadingMore(true);
    try {
      const response = await brokerSessionsService.getSessions({
        limit: 20,
        cursor: nextCursor,
        status: statusFilter === 'all' ? undefined : statusFilter,
        dateFrom,
        search: debouncedSearch || undefined,
        sort: sortField,
        order: sortDirection,
      });
      setAdditionalSessions(prev => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMoreSessions(response.hasMore);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
      toast.error('Failed to load more sessions', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const sessions = [...(data?.items || []), ...additionalSessions];
  const totalSessions = data?.total || 0;
  const activeSessions = data?.statusCounts?.active ?? 0;
  const errorSessions = data?.statusCounts?.error ?? 0;
  const hasMore = hasMoreSessions;

  if (isLoading && sessions.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-lg border bg-muted p-6 text-sm">
        <div className="flex items-center gap-1">
          <BarChart3 className="size-4 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">{totalSessions}</span>
          <span className="text-muted-foreground">Sessions</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-blue-500" />
          <span className="font-medium text-muted-foreground">{activeSessions}</span>
          <span className="text-muted-foreground">active</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="font-medium text-muted-foreground">{errorSessions}</span>
          <span className="text-muted-foreground">errors</span>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Date range</span>
          <Select value={dateFilter} onValueChange={(value: typeof dateFilter) => setDateFilter(value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Choose option</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={(value: typeof statusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          New session
        </Button>
      </div>

      <div className="rounded-lg">
        <div className="grid grid-cols-[2fr_3fr_1fr_auto] gap-4 border-b border-border/50 px-4 py-3 text-sm font-medium text-muted-foreground">
          <button
            className="flex items-center gap-1 text-left"
            onClick={() => toggleSort('name')}
          >
            Name
            <ArrowUpDown className="size-3" />
          </button>
          <div>Participants</div>
          <button
            className="flex items-center gap-1 text-left"
            onClick={() => toggleSort('conversations')}
          >
            Convos
            <ArrowUpDown className="size-3" />
          </button>
          <div className="w-8" />
        </div>

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

        {hasMore && (
          <div className="flex flex-col items-center gap-2 border-t p-4">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </Button>
            <div className="text-sm text-muted-foreground">
              Showing {sessions.length} of {totalSessions} sessions
            </div>
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
