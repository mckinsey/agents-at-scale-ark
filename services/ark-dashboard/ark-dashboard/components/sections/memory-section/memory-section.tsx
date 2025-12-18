'use client';

import { ChevronDown, Database } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import type { MemoryFilters } from '@/lib/services/memory';
import {
  useGetAllMemoryMessages,
  useGetConversations,
  useGetMemoryResources,
} from '@/lib/services/memory-hooks';
import { cn } from '@/lib/utils';

import { DeleteMemoryDropdownMenu } from './delete-memory';

export function MemorySection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [memoryFilter, setMemoryFilter] = useState('');
  const [conversationFilter, setConversationFilter] = useState('');
  const [queryFilter, setQueryFilter] = useState('');

  const filters = {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '10', 10),
    memoryName: searchParams.get('memory') || undefined,
    conversationId: searchParams.get('conversationId') || undefined,
    queryId: searchParams.get('queryId') || undefined,
  };

  const memoryResources = useGetMemoryResources();
  const conversations = useGetConversations();
  const memoryMessages = useGetAllMemoryMessages({
    memory:
      filters.memoryName && filters.memoryName !== 'all'
        ? filters.memoryName
        : undefined,
    conversation:
      filters.conversationId && filters.conversationId !== 'all'
        ? filters.conversationId
        : undefined,
    query:
      filters.queryId && filters.queryId !== 'all'
        ? filters.queryId
        : undefined,
  });

  const filteredMemories = useMemo(() => {
    return (
      memoryResources.data?.filter(memory =>
        memory.name.toLowerCase().includes(memoryFilter.toLowerCase()),
      ) || []
    );
  }, [memoryResources.data, memoryFilter]);

  const filteredConversations = useMemo(() => {
    return Array.from(
      // Extract unique conversation IDs for filtering
      new Set(conversations.data?.map(c => c.conversationId)),
    )
      .sort()
      .filter(conversation =>
        conversation.toLowerCase().includes(conversationFilter.toLowerCase()),
      );
  }, [conversations, conversationFilter]);

  const sortedMessages = useMemo(() => {
    // Sort by sequence number descending (newest first) to maintain proper chronological order
    // This ensures messages appear in the correct order regardless of timestamp precision
    return (
      memoryMessages.data?.sort(
        (a, b) => (b.sequence || 0) - (a.sequence || 0),
      ) || []
    );
  }, [memoryMessages]);

  const totalMessages = useMemo(() => {
    return sortedMessages.length;
  }, [sortedMessages]);

  const availableQueries = useMemo(() => {
    // Extract unique queryID - conversationID pairs
    return Array.from(
      new Map(
        sortedMessages?.map(m => [
          `${m.conversationId}-${m.queryId}`,
          {
            queryId: m.queryId,
            conversationId: m.conversationId,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.queryId.localeCompare(b.queryId));
  }, [sortedMessages]);

  const filteredQueries = useMemo(() => {
    return availableQueries.filter(query =>
      query.queryId.toLowerCase().includes(queryFilter.toLowerCase()),
    );
  }, [availableQueries, queryFilter]);

  const totalPages = Math.max(1, Math.ceil(totalMessages / filters.limit));

  // Apply client-side pagination to the sorted messages
  const startIndex = (filters.page - 1) * filters.limit;
  const paginatedMessages = sortedMessages.slice(
    startIndex,
    startIndex + filters.limit,
  );

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

  const handleFilterChange = (
    key: keyof MemoryFilters,
    value: string | undefined,
  ) => {
    const effectiveValue = value === 'all' ? undefined : value;
    updateUrlParams({
      [key]: effectiveValue,
      page: 1,
    });
  };

  const clearFilters = () => {
    updateUrlParams({
      page: 1,
      limit: filters.limit,
      memoryName: undefined,
      conversationId: undefined,
      queryId: undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage });
  };

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

  if (
    memoryResources.isPending ||
    conversations.isPending ||
    memoryMessages.isPending
  ) {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-48 min-w-0 justify-between text-sm font-normal">
              <span
                className={cn('min-w-0 truncate', {
                  'text-muted-foreground':
                    !searchParams.get('memory') ||
                    searchParams.get('memory') === 'all',
                })}>
                {!searchParams.get('memory') ||
                searchParams.get('memory') === 'all'
                  ? 'All Memories'
                  : filters.memoryName}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="start">
            <div className="p-2">
              <Input
                autoFocus
                placeholder="Filter memories..."
                value={memoryFilter}
                onChange={e => setMemoryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <DropdownMenuItem
                onClick={() => {
                  updateUrlParams({ memory: undefined, page: 1 });
                }}>
                All Memories
              </DropdownMenuItem>
              {filteredMemories.map(memory => (
                <DropdownMenuItem
                  key={memory.name}
                  onClick={() => {
                    updateUrlParams({ memory: memory.name, page: 1 });
                  }}>
                  {memory.name}
                </DropdownMenuItem>
              ))}
              {filteredMemories.length === 0 && memoryFilter && (
                <div className="p-3 text-sm text-gray-500">
                  No memories match your filter
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-64 min-w-0 justify-between text-sm font-normal">
              <span
                className={cn('min-w-0 truncate', {
                  'text-muted-foreground':
                    !searchParams.get('conversationId') ||
                    searchParams.get('conversationId') === 'all',
                })}>
                {!searchParams.get('conversationId') ||
                searchParams.get('conversationId') === 'all'
                  ? 'All Conversations'
                  : filters.conversationId}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                autoFocus
                placeholder="Filter conversations..."
                value={conversationFilter}
                onChange={e => setConversationFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <DropdownMenuItem
                onClick={() => {
                  handleFilterChange('conversationId', 'all');
                }}>
                All Conversations
              </DropdownMenuItem>
              {filteredConversations.map(conversationId => (
                <DropdownMenuItem
                  key={conversationId}
                  onClick={() => {
                    handleFilterChange('conversationId', conversationId);
                  }}>
                  {conversationId.length > 30
                    ? `${conversationId.substring(0, 30)}...`
                    : conversationId}
                </DropdownMenuItem>
              ))}
              {filteredConversations.length === 0 && conversationFilter && (
                <div className="p-3 text-sm text-gray-500">
                  No conversations match your filter
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 w-64 min-w-0 justify-between text-sm font-normal">
              <span
                className={cn('min-w-0 truncate', {
                  'text-muted-foreground':
                    !searchParams.get('queryId') ||
                    searchParams.get('queryId') === 'all',
                })}>
                {!searchParams.get('queryId') ||
                searchParams.get('queryId') === 'all'
                  ? 'All Queries'
                  : filters.queryId}
              </span>
              <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                autoFocus
                placeholder="Filter queries..."
                value={queryFilter}
                onChange={e => setQueryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <DropdownMenuItem
                onClick={() => {
                  handleFilterChange('queryId', 'all');
                }}>
                All Queries
              </DropdownMenuItem>
              {filteredQueries.map(({ queryId }) => (
                <DropdownMenuItem
                  key={queryId}
                  onClick={() => {
                    handleFilterChange('queryId', queryId);
                  }}>
                  {queryId.length > 30
                    ? `${queryId.substring(0, 30)}...`
                    : queryId}
                </DropdownMenuItem>
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
              (filters.conversationId && filters.conversationId !== 'all') ||
              (filters.queryId && filters.queryId !== 'all')
            )
          }>
          Clear Filters
        </Button>
        <DeleteMemoryDropdownMenu
          className="ml-auto"
          selectedQuery={
            searchParams.get('queryId')
              ? filteredQueries.find(
                  q => q.queryId === searchParams.get('queryId'),
                )
              : undefined
          }
          selectedConversation={searchParams.get('conversationId')}
          onSuccess={clearFilters}
        />
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
                  Conversation
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
                    key={`${messageRecord.conversationId}-${messageRecord.queryId}-${index}`}
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
                              {messageRecord.conversationId}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">
                              {messageRecord.conversationId}
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
          {Math.min(startIndex + filters.limit, totalMessages)} of{' '}
          {totalMessages} messages
        </div>
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          itemsPerPage={filters.limit}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>
    </div>
  );
}
