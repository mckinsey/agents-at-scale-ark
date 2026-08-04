'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useState } from 'react';

import { Database, SwapVert } from '@/components/icons';
import {
  ResourceEmptyState,
  ResourceNoResults,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox';
import { IconShell } from '@/components/ui/icon-shell';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import {
  useGetAllMemoryMessages,
  useGetConversations,
  useGetMemoryResources,
} from '@/lib/services/memory-hooks';
import { formatAge } from '@/lib/utils/time';

import { MemoryDeleteActions } from './delete-memory';

const ALL = 'all';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const MEMORY_DOCS_URL =
  'https://mckinsey.github.io/agents-at-scale-ark/reference/resources/memory/';

const COL = {
  added: 'w-[120px]',
  memory: 'w-[140px]',
  conversation: 'w-[200px]',
  query: 'w-[220px]',
};

type SortDirection = 'asc' | 'desc';

/** URL query parameters the filters are stored in. */
type MemoryFilterParam = 'memory' | 'conversationId' | 'queryId';

interface FilterOption {
  readonly value: string;
  readonly label: string;
}

interface FilterComboboxProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly allLabel: string;
  readonly noMatchesMessage: string;
  readonly onChange: (value: string) => void;
}

function FilterCombobox({
  label,
  value,
  options,
  allLabel,
  noMatchesMessage,
  onChange,
}: FilterComboboxProps) {
  const items = useMemo<FilterOption[]>(
    () => [
      { value: ALL, label: allLabel },
      ...options.map(option => ({ value: option, label: option })),
    ],
    [options, allLabel],
  );

  const selected = items.find(item => item.value === value) ?? items[0];
  const inputId = useId();

  return (
    <div className="flex w-48 flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Combobox
        items={items}
        value={selected}
        onValueChange={(next: FilterOption | null) => onChange(next?.value ?? ALL)}
        itemToStringLabel={(item: FilterOption) => item.label}
        isItemEqualToValue={(a: FilterOption, b: FilterOption) =>
          a.value === b.value
        }
        filter={(item: FilterOption, query: string) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        }>
        <ComboboxAnchor>
          <InputGroup>
            <ComboboxInput id={inputId} placeholder={allLabel} />
            <InputGroupAddon align="inline-end">
              <ComboboxTrigger />
            </InputGroupAddon>
          </InputGroup>
        </ComboboxAnchor>
        <ComboboxContent>
          <ComboboxEmpty>{noMatchesMessage}</ComboboxEmpty>
          <ComboboxList>
            {(item: FilterOption) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function MemorySection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const readPositiveInt = (key: string, fallback: number) => {
    const parsed = Number.parseInt(searchParams.get(key) ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };

  const readFilter = (key: MemoryFilterParam) => {
    const value = searchParams.get(key);
    return value && value !== ALL ? value : undefined;
  };

  const filters = {
    page: readPositiveInt('page', DEFAULT_PAGE),
    limit: readPositiveInt('limit', DEFAULT_LIMIT),
    memoryName: readFilter('memory'),
    conversationId: readFilter('conversationId'),
    queryId: readFilter('queryId'),
  };

  const memoryResources = useGetMemoryResources();
  const conversations = useGetConversations();
  const memoryMessages = useGetAllMemoryMessages({
    memory: filters.memoryName,
    conversation: filters.conversationId,
    query: filters.queryId,
  });

  const memoryOptions = useMemo(
    () =>
      (memoryResources.data ?? [])
        .map(memory => memory.name)
        .sort((a, b) => a.localeCompare(b)),
    [memoryResources.data],
  );

  const conversationOptions = useMemo(
    () =>
      Array.from(
        // Extract unique conversation IDs for filtering
        new Set(conversations.data?.map(c => c.conversationId)),
      ).sort((a, b) => a.localeCompare(b)),
    [conversations.data],
  );

  const sortedMessages = useMemo(() => {
    // Sort by sequence number (newest first by default) to maintain proper chronological order
    // This ensures messages appear in the correct order regardless of timestamp precision
    const messages = [...(memoryMessages.data ?? [])];
    return messages.sort((a, b) => {
      const diff = (a.sequence || 0) - (b.sequence || 0);
      return sortDirection === 'desc' ? -diff : diff;
    });
  }, [memoryMessages.data, sortDirection]);

  const totalMessages = sortedMessages.length;

  const availableQueries = useMemo(() => {
    // Extract unique queryID - conversationID pairs
    return Array.from(
      new Map(
        sortedMessages.map(m => [
          `${m.conversationId}-${m.queryId}`,
          {
            queryId: m.queryId,
            conversationId: m.conversationId,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.queryId.localeCompare(b.queryId));
  }, [sortedMessages]);

  const queryOptions = useMemo(
    () => availableQueries.map(query => query.queryId),
    [availableQueries],
  );

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
    key: MemoryFilterParam,
    value: string | undefined,
  ) => {
    updateUrlParams({
      [key]: value === ALL ? undefined : value,
      page: DEFAULT_PAGE,
    });
  };

  const clearFilters = () => {
    updateUrlParams({
      page: DEFAULT_PAGE,
      limit: filters.limit,
      memory: undefined,
      conversationId: undefined,
      queryId: undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    updateUrlParams({ page: newPage });
  };

  const handleItemsPerPageChange = (newLimit: number) => {
    updateUrlParams({
      limit: newLimit,
      page: DEFAULT_PAGE,
    });
  };

  const hasActiveFilters = Boolean(
    filters.memoryName || filters.conversationId || filters.queryId,
  );

  const isLoading =
    memoryResources.isPending ||
    conversations.isPending ||
    memoryMessages.isPending;

  const selectedQuery = filters.queryId
    ? availableQueries.find(query => query.queryId === filters.queryId)
    : undefined;

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1" data-testid="page-header">
          <div className="flex items-center gap-1">
            <IconShell size="default" variant="primary">
              <Database />
            </IconShell>
            <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
              Memory
            </h1>
          </div>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Manage persistent memory, context, and agent knowledge
          </p>
        </div>
        <MemoryDeleteActions
          selectedQuery={selectedQuery}
          selectedConversation={filters.conversationId}
          onSuccess={clearFilters}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FilterCombobox
          label="Memories"
          allLabel="All"
          noMatchesMessage="No memories match your filter"
          value={filters.memoryName ?? ALL}
          options={memoryOptions}
          onChange={value => handleFilterChange('memory', value)}
        />
        <FilterCombobox
          label="Conversations"
          allLabel="All"
          noMatchesMessage="No conversations match your filter"
          value={filters.conversationId ?? ALL}
          options={conversationOptions}
          onChange={value => handleFilterChange('conversationId', value)}
        />
        <FilterCombobox
          label="Queries"
          allLabel="All"
          noMatchesMessage="No queries match your filter"
          value={filters.queryId ?? ALL}
          options={queryOptions}
          onChange={value => handleFilterChange('queryId', value)}
        />
        <Button
          variant="ghost"
          onClick={clearFilters}
          disabled={!hasActiveFilters}>
          Clear filters
        </Button>
      </div>

      {isLoading && (
        <div className="text-fg-secondary flex flex-1 items-center justify-center py-8">
          Loading...
        </div>
      )}

      {!isLoading && totalMessages === 0 && hasActiveFilters && (
        <ResourceNoResults
          icon={<Database />}
          message="No messages match your filters."
        />
      )}

      {!isLoading && totalMessages === 0 && !hasActiveFilters && (
        <ResourceEmptyState
          icon={<Database />}
          title="No memory yet"
          description={
            <>
              <p>You haven&apos;t added any memory yet.</p>
              <p>Get started to see memory.</p>
            </>
          }
          actions={
            <a href={MEMORY_DOCS_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">Learn more</Button>
            </a>
          }
        />
      )}

      {!isLoading && totalMessages > 0 && (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
          <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <Table
              aria-label="Memory messages"
              className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
              <TableHeader>
                <TableRow>
                  <TableHead size="small" className={COL.added}>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-stroke-status-focus"
                      onClick={() =>
                        setSortDirection(prev =>
                          prev === 'desc' ? 'asc' : 'desc',
                        )
                      }
                      aria-label={`Sort by added, currently ${sortDirection === 'desc' ? 'newest first' : 'oldest first'}`}>
                      Added
                      <IconShell size="sm" variant="secondary">
                        <SwapVert />
                      </IconShell>
                    </button>
                  </TableHead>
                  <TableHead size="small" className={COL.memory}>
                    Memory
                  </TableHead>
                  <TableHead size="small" className={COL.conversation}>
                    Conversation
                  </TableHead>
                  <TableHead size="small" className={COL.query}>
                    Query
                  </TableHead>
                  <TableHead size="small">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMessages.map((messageRecord, index) => {
                  const message = JSON.stringify(messageRecord.message);
                  return (
                    <TableRow
                      key={`${messageRecord.conversationId}-${messageRecord.queryId}-${index}`}>
                      <TableCell size="small" className={COL.added}>
                        <span className="text-fg-primary">
                          {formatAge(messageRecord.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell size="small" className={COL.memory}>
                        <TruncatedTooltip label={messageRecord.memoryName}>
                          <span className="text-fg-primary block truncate">
                            {messageRecord.memoryName}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell size="small" className={COL.conversation}>
                        <TruncatedTooltip label={messageRecord.conversationId}>
                          <span className="text-fg-primary block truncate">
                            {messageRecord.conversationId}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell size="small" className={COL.query}>
                        <TruncatedTooltip label={messageRecord.queryId}>
                          <span className="text-fg-primary block truncate">
                            {messageRecord.queryId}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                      <TableCell size="small">
                        <TruncatedTooltip
                          label={
                            <pre className="max-w-md text-xs whitespace-pre-wrap">
                              {JSON.stringify(messageRecord.message, null, 2)}
                            </pre>
                          }>
                          <span className="text-fg-primary block truncate">
                            {message}
                          </span>
                        </TruncatedTooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex flex-none flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-fg-secondary text-sm leading-5">
              Showing {paginatedMessages.length > 0 ? startIndex + 1 : 0} to{' '}
              {Math.min(startIndex + filters.limit, totalMessages)} of{' '}
              {totalMessages} messages
            </span>
            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              itemsPerPage={filters.limit}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
