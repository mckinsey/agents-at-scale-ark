'use client';

import { ChevronDown, Database } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import {
  type MemoryFilters,
  type MemoryResource,
  memoryService,
} from '@/lib/services/memory';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

interface MemorySectionProps {
  readonly initialFilters?: Partial<MemoryFilters>;
}

export function MemorySection({ initialFilters }: MemorySectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [memoryMessages, setMemoryMessages] = useState<
    {
      timestamp: string;
      memoryName: string;
      sessionId: string;
      queryId: string;
      message: { role: string; content: string; name?: string };
      sequence?: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [availableMemories, setAvailableMemories] = useState<MemoryResource[]>(
    [],
  );
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [availableQueries, setAvailableQueries] = useState<string[]>([]);

  const [memoryFilter, setMemoryFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [queryFilter, setQueryFilter] = useState('');
  const [memoryDropdownOpen, setMemoryDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [queryDropdownOpen, setQueryDropdownOpen] = useState(false);

  const memoryFilterRef = useRef<HTMLInputElement>(null);
  const sessionFilterRef = useRef<HTMLInputElement>(null);
  const queryFilterRef = useRef<HTMLInputElement>(null);

  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialLimit = parseInt(searchParams.get('limit') || '10', 10);
  const initialMemory = searchParams.get('memory') || undefined;
  const initialSessionId = searchParams.get('sessionId') || undefined;
  const initialQueryId = searchParams.get('queryId') || undefined;

  const [totalMessages, setTotalMessages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(initialLimit);
  const [filters, setFilters] = useState<MemoryFilters>({
    limit: initialLimit,
    page: initialPage,
    memoryName: initialMemory,
    sessionId: initialSessionId,
    queryId: initialQueryId,
    ...initialFilters,
  });

  const updateUrlParams = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());

      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });

      const newUrl =
        pathname + (newParams.toString() ? `?${newParams.toString()}` : '');
      router.push(newUrl, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);

    try {
      const [memoriesData, sessionsData, messagesData] = await Promise.all([
        memoryService.getMemoryResources(),
        memoryService.getSessions(),
        memoryService.getAllMemoryMessages({
          memory:
            filters.memoryName && filters.memoryName !== 'all'
              ? filters.memoryName
              : undefined,
          session:
            filters.sessionId && filters.sessionId !== 'all'
              ? filters.sessionId
              : undefined,
          query:
            filters.queryId && filters.queryId !== 'all'
              ? filters.queryId
              : undefined,
        }),
      ]);

      // Sort by sequence number descending (newest first) to maintain proper chronological order
      // This ensures messages appear in the correct order regardless of timestamp precision
      const sortedMessages = messagesData.sort(
        (a, b) => (b.sequence || 0) - (a.sequence || 0),
      );

      setTotalMessages(sortedMessages.length);
      setAvailableMemories(memoriesData);
      setMemoryMessages(sortedMessages);

      // Extract unique session IDs and query IDs for filtering
      const sessionIds = new Set(sessionsData.map(s => s.sessionId));
      setAvailableSessions(Array.from(sessionIds).sort());

      const queryIds = new Set(sortedMessages.map(m => m.queryId));
      setAvailableQueries(Array.from(queryIds).sort());
    } catch (error) {
      console.error('Failed to load memory messages:', error);
      toast.error('Failed to Load Memory Messages', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
    const limitFromUrl = parseInt(searchParams.get('limit') || '10', 10);
    const memoryFromUrl = searchParams.get('memory') || undefined;
    const sessionFromUrl = searchParams.get('sessionId') || undefined;
    const queryFromUrl = searchParams.get('queryId') || undefined;

    // Only update if URL params actually changed
    if (
      pageFromUrl !== currentPage ||
      limitFromUrl !== itemsPerPage ||
      memoryFromUrl !== filters.memoryName ||
      sessionFromUrl !== filters.sessionId ||
      queryFromUrl !== filters.queryId
    ) {
      setCurrentPage(pageFromUrl);
      setItemsPerPage(limitFromUrl);
      setFilters({
        page: pageFromUrl,
        limit: limitFromUrl,
        memoryName: memoryFromUrl,
        sessionId: sessionFromUrl,
        queryId: queryFromUrl,
      });
    }
  }, [
    searchParams,
    currentPage,
    itemsPerPage,
    filters.memoryName,
    filters.sessionId,
    filters.queryId,
  ]);

  // Focus filter inputs when dropdowns open
  useEffect(() => {
    if (memoryDropdownOpen && memoryFilterRef.current) {
      memoryFilterRef.current.focus();
    }
  }, [memoryDropdownOpen]);

  useEffect(() => {
    if (sessionDropdownOpen && sessionFilterRef.current) {
      sessionFilterRef.current.focus();
    }
  }, [sessionDropdownOpen]);

  useEffect(() => {
    if (queryDropdownOpen && queryFilterRef.current) {
      queryFilterRef.current.focus();
    }
  }, [queryDropdownOpen]);

  // Filtered options
  const filteredMemories = useMemo(() => {
    return availableMemories.filter(memory =>
      memory.name.toLowerCase().includes(memoryFilter.toLowerCase()),
    );
  }, [availableMemories, memoryFilter]);

  const filteredSessions = useMemo(() => {
    return availableSessions.filter(session =>
      session.toLowerCase().includes(sessionFilter.toLowerCase()),
    );
  }, [availableSessions, sessionFilter]);

  const filteredQueries = useMemo(() => {
    return availableQueries.filter(query =>
      query.toLowerCase().includes(queryFilter.toLowerCase()),
    );
  }, [availableQueries, queryFilter]);

  const handleFilterChange = (
    key: keyof MemoryFilters,
    value: string | undefined,
  ) => {
    const effectiveValue = value === 'all' ? undefined : value;

    // Update URL params immediately
    updateUrlParams({
      [key]: effectiveValue,
      page: 1,
    });
  };

  const clearFilters = () => {
    // Only update URL - let the useEffect handle state updates
    updateUrlParams({
      page: 1,
      limit: itemsPerPage,
      memoryName: undefined,
      sessionId: undefined,
      queryId: undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    // Only update URL - let the useEffect handle state updates
    updateUrlParams({ page: newPage });
  };

  const totalPages = Math.max(1, Math.ceil(totalMessages / itemsPerPage));

  // Apply client-side pagination to the sorted messages
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedMessages = memoryMessages.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return timestamp;
    }
  };

  const handleItemsPerPageChange = (newLimit: number) => {
    // Only update URL - let the useEffect handle state updates
    updateUrlParams({
      limit: newLimit,
      page: 1,
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Database className="mx-auto mb-4 h-8 w-8 animate-pulse text-gray-400" />
          <p className="text-gray-500">Loading memory messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <DropdownMenu
          open={memoryDropdownOpen}
          onOpenChange={setMemoryDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-48 min-w-0 justify-between text-sm font-normal">
              <span
                className={`min-w-0 truncate ${!searchParams.get('memory') || searchParams.get('memory') === 'all' ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get('memory') ||
                searchParams.get('memory') === 'all'
                  ? 'All Memories'
                  : searchParams.get('memory')}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="start">
            <div className="p-2">
              <Input
                ref={memoryFilterRef}
                placeholder="Filter memories..."
                value={memoryFilter}
                onChange={e => setMemoryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div
                className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  updateUrlParams({ memory: undefined, page: 1 });
                  setMemoryDropdownOpen(false);
                }}>
                All Memories
              </div>
              {filteredMemories.map(memory => (
                <div
                  key={memory.name}
                  className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    updateUrlParams({ memory: memory.name, page: 1 });
                    setMemoryDropdownOpen(false);
                  }}>
                  {memory.name}
                </div>
              ))}
              {filteredMemories.length === 0 && memoryFilter && (
                <div className="p-3 text-sm text-gray-500">
                  No memories match your filter
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu
          open={sessionDropdownOpen}
          onOpenChange={setSessionDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-64 min-w-0 justify-between text-sm font-normal">
              <span
                className={`min-w-0 truncate ${!searchParams.get('sessionId') || searchParams.get('sessionId') === 'all' ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get('sessionId') ||
                searchParams.get('sessionId') === 'all'
                  ? 'All Sessions'
                  : searchParams.get('sessionId')!.length > 30
                    ? `${searchParams.get('sessionId')!.substring(0, 30)}...`
                    : searchParams.get('sessionId')}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                ref={sessionFilterRef}
                placeholder="Filter sessions..."
                value={sessionFilter}
                onChange={e => setSessionFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div
                className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  handleFilterChange('sessionId', 'all');
                  setSessionDropdownOpen(false);
                }}>
                All Sessions
              </div>
              {filteredSessions.map(sessionId => (
                <div
                  key={sessionId}
                  className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    handleFilterChange('sessionId', sessionId);
                    setSessionDropdownOpen(false);
                  }}>
                  {sessionId.length > 30
                    ? `${sessionId.substring(0, 30)}...`
                    : sessionId}
                </div>
              ))}
              {filteredSessions.length === 0 && sessionFilter && (
                <div className="p-3 text-sm text-gray-500">
                  No sessions match your filter
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu
          open={queryDropdownOpen}
          onOpenChange={setQueryDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-64 min-w-0 justify-between text-sm font-normal">
              <span
                className={`min-w-0 truncate ${!searchParams.get('queryId') || searchParams.get('queryId') === 'all' ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get('queryId') ||
                searchParams.get('queryId') === 'all'
                  ? 'All Queries'
                  : searchParams.get('queryId')!.length > 30
                    ? `${searchParams.get('queryId')!.substring(0, 30)}...`
                    : searchParams.get('queryId')}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                ref={queryFilterRef}
                placeholder="Filter queries..."
                value={queryFilter}
                onChange={e => setQueryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div
                className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  handleFilterChange('queryId', 'all');
                  setQueryDropdownOpen(false);
                }}>
                All Queries
              </div>
              {filteredQueries.map(queryId => (
                <div
                  key={queryId}
                  className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    handleFilterChange('queryId', queryId);
                    setQueryDropdownOpen(false);
                  }}>
                  {queryId.length > 30
                    ? `${queryId.substring(0, 30)}...`
                    : queryId}
                </div>
              ))}
              {filteredQueries.length === 0 && queryFilter && (
                <div className="p-3 text-sm text-gray-500">
                  No queries match your filter
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          disabled={
            !(
              (filters.memoryName && filters.memoryName !== 'all') ||
              (filters.sessionId && filters.sessionId !== 'all') ||
              (filters.queryId && filters.queryId !== 'all')
            )
          }>
          Clear Filters
        </Button>
      </div>

      {/* Messages Table */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Memory
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Session
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Query
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-950">
              {paginatedMessages.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <DASHBOARD_SECTIONS.memory.icon />
                        </EmptyMedia>
                        <EmptyTitle>No Messages Yet</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </td>
                </tr>
              ) : (
                paginatedMessages.map((messageRecord, index) => (
                  <tr
                    key={`${messageRecord.sessionId}-${messageRecord.queryId}-${index}`}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    <td className="px-3 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {formatTimestamp(messageRecord.timestamp)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <div className="max-w-20 truncate">
                        {messageRecord.memoryName}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="max-w-24 truncate">
                              {messageRecord.sessionId}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">
                              {messageRecord.sessionId}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="max-w-24 truncate">
                              {messageRecord.queryId}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">
                              {messageRecord.queryId}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <pre className="text-xs whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                        {JSON.stringify(messageRecord.message, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary and Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {paginatedMessages.length > 0 ? startIndex + 1 : 0} to{' '}
          {Math.min(startIndex + itemsPerPage, totalMessages)} of{' '}
          {totalMessages} messages
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>
    </div>
  );
}
