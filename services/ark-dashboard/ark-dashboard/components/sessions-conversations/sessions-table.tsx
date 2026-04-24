'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, BarChart3, Coins, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { SessionTableRow } from './session-table-row';
import { NewSessionDialog } from './new-session-dialog';

interface Props {
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

type SortField = 'date' | 'tokens';
type SortDirection = 'asc' | 'desc';

export function SessionsTable({ onSelectSession, selectedSessionId, searchQuery, onSearchChange }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'error'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [cursor, setCursor] = useState<number>(0);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-lg border p-4 text-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">{totalSessions}</span>
          <span className="text-muted-foreground">Sessions</span>
        </div>
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <span className="font-medium text-muted-foreground">{totalTokens.toLocaleString()}</span>
          <span className="text-muted-foreground">Tokens</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-blue-500" />
          <span className="font-medium text-muted-foreground">{activeSessions}</span>
          <span className="text-muted-foreground">active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="font-medium text-muted-foreground">{errorSessions}</span>
          <span className="text-muted-foreground">errors</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
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
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          New session
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_3fr_1fr_1fr_auto] gap-4 border-b bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground">
          <button
            className="flex items-center gap-1 text-left"
            onClick={() => toggleSort('date')}
          >
            Name
            <ArrowUpDown className="size-3" />
          </button>
          <div>Participants</div>
          <div>Convos</div>
          <button
            className="flex items-center gap-1 text-left"
            onClick={() => toggleSort('tokens')}
          >
            Tokens
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

      <NewSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
