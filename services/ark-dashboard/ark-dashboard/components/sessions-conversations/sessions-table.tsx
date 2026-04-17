'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { SessionTableRow } from './session-table-row';

interface Props {
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  searchQuery: string;
}

type SortField = 'date' | 'tokens';
type SortDirection = 'asc' | 'desc';

export function SessionsTable({ onSelectSession, selectedSessionId, searchQuery }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [cursor, setCursor] = useState<number>(0);

  const dateFrom = useMemo(() => {
    if (dateFilter === 'all') return undefined;
    const now = new Date();
    if (dateFilter === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (dateFilter === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return undefined;
  }, [dateFilter]);

  const { data, isLoading, isError, error, refetch } = useListSessions({
    limit: 20,
    cursor,
    status: statusFilter === 'all' ? undefined : statusFilter,
    dateFrom,
    search: search || undefined,
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
    const timer = setTimeout(() => {
      setCursor(0);
      setSearch(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCursor(0);
  }, [statusFilter, dateFilter, sortField, sortDirection]);

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
  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const errorSessions = sessions.filter((s) => s.errorCount > 0).length;
  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
  const hasMore = data?.hasMore || false;

  if (isLoading && cursor === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4 rounded-lg border p-4">
        <div>
          <div className="text-sm text-muted-foreground">Total Sessions</div>
          <div className="text-2xl font-bold">{totalSessions}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Active</div>
          <div className="text-2xl font-bold text-blue-600">{activeSessions}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Errors</div>
          <div className="text-2xl font-bold text-red-600">{errorSessions}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Total Tokens</div>
          <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(value: typeof statusFilter) => setStatusFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="idle">Idle</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={(value: typeof dateFilter) => setDateFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => toggleSort('date')}>
            Date
            {sortField === 'date' && (
              sortDirection === 'asc' ? <ChevronUp className="ml-1 size-4" /> : <ChevronDown className="ml-1 size-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggleSort('tokens')}>
            Tokens
            {sortField === 'tokens' && (
              sortDirection === 'asc' ? <ChevronUp className="ml-1 size-4" /> : <ChevronDown className="ml-1 size-4" />
            )}
          </Button>
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
          <div className="flex flex-col items-center gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setCursor(data?.nextCursor || 0)}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </Button>
            <div className="text-sm text-muted-foreground">
              Showing {sessions.length} of {totalSessions} sessions
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
