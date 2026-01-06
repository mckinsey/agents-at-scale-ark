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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { EvaluationStatusIndicator } from '@/components/evaluation';
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
import { queriesService } from '@/lib/services/queries';
import { useListQueries } from '@/lib/services/queries-hooks';
import { getResourceEventsUrl } from '@/lib/utils/events';
import { formatAge } from '@/lib/utils/time';

type QueryResponse = components['schemas']['QueryResponse'];

type SortField = 'createdAt' | 'none';
type SortDirection = 'asc' | 'desc';

// NEW: view mode for the Output column
type OutputViewMode = 'content' | 'raw';

export const QueriesSection = forwardRef<{ openAddEditor: () => void }>(
  function QueriesSection(_, ref) {
    const [queries, setQueries] = useState<QueryResponse[]>([]);
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [outputViewMode, setOutputViewMode] =
      useState<OutputViewMode>('content'); // NEW
    const router = useRouter();

    useImperativeHandle(ref, () => ({
      openAddEditor: () => {
        router.push(`/query/new`);
      },
    }));

    const getStatus = (query: QueryResponse) => {
      return (query.status as { phase?: string })?.phase || '—';
    };

    const {
      data: listQueriesData,
      isLoading: listQueriesLoading,
      isFetching: listQueriesFetching,
      isError: listQueriesError,
      error: listQueriesErrorObject,
      refetch: loadQueries,
    } = useListQueries();

    useEffect(() => {
      if (listQueriesData && !listQueriesError) {
        setQueries(listQueriesData.items);
      }

      if (listQueriesError) {
        toast.error('Failed to Load Queries', {
          description:
            listQueriesErrorObject instanceof Error
              ? listQueriesErrorObject.message
              : 'An unexpected error occurred',
        });
      }
    }, [listQueriesError, listQueriesData, listQueriesErrorObject]);

    const truncate = (text: string, maxLen = 120) =>
      text.length > maxLen ? text.slice(0, maxLen) + '...' : text;

    const truncateText = (
      text: string | undefined,
      maxLength: number = 120,
    ) => {
      if (!text) return '-';
      const newlineIndex = text.indexOf('\n');
      const cutoffIndex =
        newlineIndex > -1 ? Math.min(newlineIndex, maxLength) : maxLength;
      return text.length > cutoffIndex
        ? text.substring(0, cutoffIndex) + '...'
        : text;
    };

    // Helper function to convert input to displayable string
    const getInputDisplayText = (
      input:
        | string
        | { role: string; content?: string | unknown }[]
        | undefined,
    ): string => {
      if (!input) return '-';
      if (typeof input === 'string') return input;
      if (Array.isArray(input)) {
        // Show just the content from the last message
        const lastMsg = input[input.length - 1];
        if (!lastMsg.content) return '-';
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
      };
      return `${usage.promptTokens || 0} / ${usage.completionTokens || 0}`;
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
        const aTime = a.creationTimestamp
          ? new Date(a.creationTimestamp).getTime()
          : 0;
        const bTime = b.creationTimestamp
          ? new Date(b.creationTimestamp).getTime()
          : 0;
        return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });

    // Extract response content (text) if available
    const getFirstResponseText = (query: QueryResponse) => {
      const response = query.status?.response as
        | { content?: string }
        | undefined;
      if (!response) return undefined;
      return response.content;
    };

    // Build a small JSON preview string (response object or status)
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

    // Get output from query - used in the duplicate table section
    const getOutput = (query: QueryResponse) => {
      return getFirstResponseText(query) || '-';
    };

    const renderOutputCell = (query: QueryResponse) => {
      const text = getFirstResponseText(query) || '';
      if (outputViewMode === 'content') {
        return (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="text-left">
                  {truncateText(text)}
                </TooltipTrigger>
                {text && text.length > 120 && (
                  <TooltipContent className="max-w-md">
                    <p className="whitespace-pre-wrap">{text}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </>
        );
      }

      // JSON
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

    const getStatusBadge = (status: string | undefined, queryName: string) => {
      const normalizedStatus = status as
        | 'done'
        | 'error'
        | 'running'
        | 'canceled'
        | 'default';
      const variant = ['done', 'error', 'running', 'canceled'].includes(
        status || '',
      )
        ? normalizedStatus
        : 'default';

      return (
        <StatusDot
          variant={variant}
          onCancel={
            status === 'running' ? () => handleCancel(queryName) : undefined
          }
        />
      );
    };

    const handleDelete = async (queryName: string) => {
      try {
        await queriesService.delete(queryName);
        toast.success('Query Deleted', {
          description: 'Successfully deleted query',
        });
        const data = await queriesService.list();
        setQueries(data.items);
      } catch (error) {
        console.error('Failed to delete query:', error);
        toast.error('Failed to Delete Query', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    };

    const handleCancel = async (queryName: string) => {
      try {
        await queriesService.cancel(queryName);
        toast.success('Query Canceled', {
          description: 'Successfully canceled query',
        });
        const data = await queriesService.list();
        setQueries(data.items);
      } catch (error) {
        console.error('Failed to cancel query:', error);
        toast.error('Failed to Cancel Query', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    };

    if (listQueriesLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        {listQueriesFetching ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">Refetching...</div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <main className="flex-1 space-y-4 overflow-auto p-4">
              <div className="ml-auto">
                <Button
                  onClick={() => loadQueries()}
                  disabled={listQueriesFetching}>
                  <RefreshCw
                    className={`h-4 w-4 ${listQueriesFetching ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                        <th
                          className="cursor-pointer px-3 py-2 text-left text-sm font-medium text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('createdAt')}>
                          <div className="flex items-center">Name</div>
                        </th>
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
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Target
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Input
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex items-center justify-between">
                            <span>Output</span>
                            {/* NEW: global view mode toggle */}
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
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Output
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Token Usage (Prompt / Completion)
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Evaluations
                        </th>
                        <th className="px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedQueries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={11}
                            className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                            <Empty>
                              <EmptyHeader>
                                <EmptyMedia variant="icon">
                                  <DASHBOARD_SECTIONS.queries.icon />
                                </EmptyMedia>
                                <EmptyTitle>No Queries Yet</EmptyTitle>
                                <EmptyDescription>
                                  You haven&apos;t created any queries yet. Get
                                  started by creating your first query.
                                </EmptyDescription>
                              </EmptyHeader>
                              <EmptyContent>
                                <Link href="/query/new">
                                  <Button asChild>
                                    <div>
                                      <Plus className="h-4 w-4" />
                                      Create Query
                                    </div>
                                  </Button>
                                </Link>
                              </EmptyContent>
                              <Button
                                variant="link"
                                asChild
                                className="text-muted-foreground"
                                size="sm">
                                <a
                                  href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/queries/"
                                  target="_blank">
                                  Learn More <ArrowUpRightIcon />
                                </a>
                              </Button>
                            </Empty>
                          </td>
                        </tr>
                      ) : (
                        sortedQueries.map(query => {
                          const target = getTargetDisplay(query);
                          const output = getOutput(query);
                          const inputDisplayText = getInputDisplayText(
                            query.input,
                          );
                          return (
                            <tr
                              key={query.name}
                              className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30"
                              onClick={() =>
                                router.push(`/query/${query.name}`)
                              }>
                              <td className="px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">
                                {query.name}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {formatAge(query.creationTimestamp)}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {target}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger className="text-left">
                                      {truncateText(inputDisplayText)}
                                    </TooltipTrigger>
                                    {inputDisplayText &&
                                      inputDisplayText.length > 50 && (
                                        <TooltipContent className="max-w-md">
                                          <p className="whitespace-pre-wrap">
                                            {inputDisplayText}
                                          </p>
                                        </TooltipContent>
                                      )}
                                  </Tooltip>
                                </TooltipProvider>
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger className="text-left">
                                      {truncateText(output)}
                                    </TooltipTrigger>
                                    {output && output.length > 50 && (
                                      <TooltipContent className="max-w-md">
                                        <p className="whitespace-pre-wrap">
                                          {output}
                                        </p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {renderOutputCell(query)}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {formatTokenUsage(query)}
                              </td>
                              <td className="px-3 py-3 align-middle text-sm text-gray-900 dark:text-gray-100">
                                <div className="flex items-center justify-center">
                                  <EvaluationStatusIndicator
                                    queryName={query.name}
                                    compact={true}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                {getStatusBadge(getStatus(query), query.name)}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-start gap-1">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      const eventsUrl = getResourceEventsUrl(
                                        'Query',
                                        query.name,
                                      );
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
        )}
      </div>
    );
  },
);

interface StatusDotProps {
  variant: 'done' | 'error' | 'running' | 'canceled' | 'default';
  onCancel?: () => void;
}

function StatusDot({ variant, onCancel }: StatusDotProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'done':
        return 'bg-green-300';
      case 'error':
        return 'bg-red-300';
      case 'running':
        return 'bg-blue-300';
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
      case 'canceled':
        return 'Canceled';
      default:
        return 'Unknown';
    }
  };

  if (variant === 'running' && onCancel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <span
                className={`inline-flex h-[16px] w-[16px] items-center rounded-full text-xs font-medium ${getVariantClasses()}`}
              />
              <span
                className="ml-2 cursor-pointer text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                onClick={onCancel}>
                Cancel
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getStatusName()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span
            className={`inline-flex h-[16px] w-[16px] items-center rounded-full px-2 py-1 text-xs font-medium ${getVariantClasses()}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{getStatusName()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
