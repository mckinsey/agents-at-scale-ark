'use client';

import {
  ArrowUpRightIcon,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { components } from '@/lib/api/generated/types';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { queriesService } from '@/lib/services/queries';
import type { useListQueries } from '@/lib/services/queries-hooks';
import { getResourceEventsUrl } from '@/lib/utils/events';
import { formatAge } from '@/lib/utils/time';

type QueryResponse = components['schemas']['QueryResponse'];
type ListQueriesResult = ReturnType<typeof useListQueries>;

type OutputViewMode = 'content' | 'raw';
type SortField = 'createdAt' | 'none';
type SortDirection = 'asc' | 'desc';

interface QueriesSectionProps {
  readonly searchTerm: string;
  readonly onClearSearch: () => void;
  readonly queryResult: ListQueriesResult;
}

export const QueriesSection = forwardRef<
  { openAddEditor: () => void },
  QueriesSectionProps
>(function QueriesSection({ searchTerm, onClearSearch, queryResult }, ref) {
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>('content');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { push } = useNamespacedNavigation();

  useImperativeHandle(ref, () => ({
    openAddEditor: () => {
      push(`/query/new`);
    },
  }));

  const { data, isLoading, isFetching, isError, error, refetch } = queryResult;

  useEffect(() => {
    if (isError) {
      toast.error('Failed to Load Queries', {
        description:
          error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }, [isError, error]);

  const queries = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedQueries = [...queries].sort((a, b) => {
    if (sortField === 'createdAt') {
      const aTime = a.creationTimestamp ? new Date(a.creationTimestamp).getTime() : 0;
      const bTime = b.creationTimestamp ? new Date(b.creationTimestamp).getTime() : 0;
      return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
    }
    return 0;
  });

  const truncate = (text: string | undefined, maxLength: number = 120): string => {
    if (!text) return '-';
    const newlineIndex = text.indexOf('\n');
    const cutoffIndex =
      newlineIndex > -1 ? Math.min(newlineIndex, maxLength) : maxLength;
    return text.length > cutoffIndex
      ? text.substring(0, cutoffIndex) + '...'
      : text;
  };

  const getInputDisplayText = (
    input: string | { role: string; content?: unknown }[] | undefined,
  ): string => {
    if (!input) return '-';
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      const lastMsg = input[input.length - 1];
      if (!lastMsg?.content) return '-';
      return typeof lastMsg.content === 'string'
        ? lastMsg.content
        : JSON.stringify(lastMsg.content);
    }
    return '-';
  };

  const formatTokenUsage = (query: QueryResponse) => {
    if (!query.status?.tokenUsage) return '-';
    const usage = query.status.tokenUsage as {
      promptTokens?: number;
      completionTokens?: number;
      cachedTokens?: number;
    };
    const cached = usage.cachedTokens || 0;
    const newInput = Math.max(0, (usage.promptTokens || 0) - cached);
    const base = `${newInput} / ${usage.completionTokens || 0}`;
    return cached > 0 ? `${base} (${cached} cached)` : base;
  };

  const getTargetDisplay = (query: QueryResponse) => {
    const response = query.status?.response as
      | { target?: { name: string; type: string } }
      | undefined;
    if (!response) return '-';
    const target = response.target;
    if (!target?.type || !target?.name) return '-';
    return `${target.type}:${target.name}`;
  };

  const getFirstResponseText = (query: QueryResponse) => {
    const response = query.status?.response as { content?: string } | undefined;
    return response?.content;
  };

  const getFirstResponseJsonPreview = (query: QueryResponse) => {
    const response = query.status?.response;
    const raw = response ?? query.status ?? query;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      try {
        return String(raw);
      } catch {
        return '{}';
      }
    }
  };

  const getStatus = (query: QueryResponse) =>
    (query.status as { phase?: string })?.phase || '—';

  const renderOutputCell = (query: QueryResponse) => {
    const text = getFirstResponseText(query) || '';
    if (outputViewMode === 'content') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-left">
              {truncate(text)}
            </TooltipTrigger>
            {text && text.length > 120 && (
              <TooltipContent className="max-w-md">
                <p className="whitespace-pre-wrap">{text}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );
    }
    const preview = getFirstResponseJsonPreview(query);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="text-left font-mono text-[11px]">
            {truncate(preview.replace(/\s+/g, ' '), 140)}
          </TooltipTrigger>
          <TooltipContent className="max-w-lg">
            <pre className="max-h-64 overflow-auto text-[11px] whitespace-pre-wrap">
              {preview}
            </pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const handleCancel = async (queryName: string) => {
    try {
      await queriesService.cancel(queryName);
      toast.success('Query Canceled', { description: 'Successfully canceled query' });
      refetch();
    } catch (err) {
      toast.error('Failed to Cancel Query', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  const handleDelete = async (queryName: string) => {
    try {
      await queriesService.delete(queryName);
      toast.success('Query Deleted', { description: 'Successfully deleted query' });
      refetch();
    } catch (err) {
      toast.error('Failed to Delete Query', {
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    }
  };

  const getConditionMessage = (query: QueryResponse): string | undefined => {
    const conditions = (query.status as { conditions?: Array<{ type?: string; message?: string }> })?.conditions;
    if (!conditions) return undefined;
    const completed = conditions.find(c => c.type === 'Completed');
    return completed?.message || undefined;
  };

  const getStatusBadge = (status: string | undefined, queryName: string, query: QueryResponse) => {
    const normalizedStatus = status as
      | 'done'
      | 'error'
      | 'running'
      | 'provisioning'
      | 'canceled'
      | 'default';
    const variant = ['done', 'error', 'running', 'provisioning', 'canceled'].includes(status || '')
      ? normalizedStatus
      : 'default';
    return (
      <StatusDot
        variant={variant}
        onCancel={status === 'running' ? () => handleCancel(queryName) : undefined}
        conditionMessage={status === 'provisioning' ? getConditionMessage(query) : undefined}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const noMatches = searchTerm && total === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-full flex-col">
        <main className="mt-4 flex-1 space-y-4 overflow-auto">
          <div className="ml-auto">
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Name</th>
                    <th
                      className="cursor-pointer px-3 py-2 text-left text-sm font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                      onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center">
                        Age
                        {sortField === 'createdAt' &&
                          (sortDirection === 'desc' ? (
                            <ChevronDown className="ml-1 h-4 w-4" />
                          ) : (
                            <ChevronUp className="ml-1 h-4 w-4" />
                          ))}
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Target</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Input</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center justify-between">
                        <span>Output</span>
                        <div className="ml-2 inline-flex items-center gap-1 text-xs">
                          <button
                            className={`rounded px-2 py-1 ${outputViewMode === 'content' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                            onClick={() => setOutputViewMode('content')}>
                            Content
                          </button>
                          <button
                            className={`rounded px-2 py-1 ${outputViewMode === 'raw' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                            onClick={() => setOutputViewMode('raw')}>
                            Raw
                          </button>
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Token Usage (Input / Completion)</th>
                    <th className="px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Status</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                        {noMatches ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyTitle>No matching queries</EmptyTitle>
                              <EmptyDescription>
                                No queries match &ldquo;{searchTerm}&rdquo;. Try a different search.
                              </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                              <Button variant="outline" onClick={onClearSearch}>
                                Clear search
                              </Button>
                            </EmptyContent>
                          </Empty>
                        ) : (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <DASHBOARD_SECTIONS.queries.icon />
                              </EmptyMedia>
                              <EmptyTitle>No Queries Yet</EmptyTitle>
                              <EmptyDescription>
                                You haven&apos;t created any queries yet. Get started by creating your first query.
                              </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                              <NamespacedLink href="/query/new">
                                <Button asChild>
                                  <div>
                                    <Plus className="h-4 w-4" />
                                    Create Query
                                  </div>
                                </Button>
                              </NamespacedLink>
                            </EmptyContent>
                            <Button variant="link" asChild className="text-muted-foreground" size="sm">
                              <a href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/queries/" target="_blank">
                                Learn More <ArrowUpRightIcon />
                              </a>
                            </Button>
                          </Empty>
                        )}
                      </td>
                    </tr>
                  ) : (
                    sortedQueries.map(query => {
                      const target = getTargetDisplay(query);
                      const inputDisplayText = getInputDisplayText(query.input);
                      return (
                        <tr
                          key={query.name}
                          className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                          onClick={() => push(`/query/${query.name}`)}>
                          <td className="px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">{query.name}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{formatAge(query.creationTimestamp)}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{target}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="text-left">{truncate(inputDisplayText)}</TooltipTrigger>
                                {inputDisplayText && inputDisplayText.length > 50 && (
                                  <TooltipContent className="max-w-md">
                                    <p className="whitespace-pre-wrap">{inputDisplayText}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{renderOutputCell(query)}</td>
                          <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">{formatTokenUsage(query)}</td>
                          <td className="px-3 py-3 text-center">{getStatusBadge(getStatus(query), query.name, query)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-start gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const eventsUrl = getResourceEventsUrl('Query', query.name);
                                  window.open(eventsUrl, '_blank');
                                }}
                                className="rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                                title="View query events">
                                <FileText className="h-4 w-4" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDelete(query.name);
                                }}
                                className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
                                title="Delete query">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
});

interface StatusDotProps {
  variant: 'done' | 'error' | 'running' | 'canceled' | 'provisioning' | 'default';
  onCancel?: () => void;
  conditionMessage?: string;
}

function StatusDot({ variant, onCancel, conditionMessage }: StatusDotProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'done':
        return 'bg-green-300';
      case 'error':
        return 'bg-red-300';
      case 'running':
        return 'bg-blue-300';
      case 'provisioning':
        return 'bg-amber-300';
      case 'canceled':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };
  const getStatusName = () => {
    switch (variant) {
      case 'done':
        return 'Done';
      case 'error':
        return 'Error';
      case 'running':
        return 'Running';
      case 'provisioning':
        return 'Provisioning';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Unknown';
    }
  };

  if (variant === 'running' && onCancel) {
    return (
      <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex h-[16px] w-[16px] items-center rounded-full text-xs font-medium ${getVariantClasses()}`}
                aria-label={getStatusName()}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>{getStatusName()}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <button
          type="button"
          className="ml-2 cursor-pointer bg-transparent p-0 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          onClick={e => {
            e.stopPropagation();
            onCancel();
          }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={`inline-flex h-[16px] w-[16px] items-center rounded-full px-2 py-1 text-xs font-medium ${getVariantClasses()}`} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{getStatusName()}</p>
          {conditionMessage && <p className="text-xs text-gray-400">{conditionMessage}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
