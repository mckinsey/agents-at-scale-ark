"use client";

import { EvaluationStatusIndicator } from "@/components/evaluation";
import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { toast } from "@/components/ui/use-toast";
import type { components } from "@/lib/api/generated/types";
import { Trash2, ChevronUp, ChevronDown, RefreshCw, FileText } from "lucide-react";
import { formatAge } from "@/lib/utils/time";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { queriesService } from "@/lib/services/queries";
import { getResourceEventsUrl } from "@/lib/utils/events";
import { useRouter } from "next/navigation";
import { useListQueries } from "@/lib/services/queries-hooks";
import { Button } from "../ui/button";

type QueryResponse = components["schemas"]["QueryResponse"];
interface QueriesSectionProps {
  namespace: string;
}

type SortField = "createdAt" | "none";
type SortDirection = "asc" | "desc";

// NEW: view mode for the Output column
type OutputViewMode = 'content' | 'raw';

export const QueriesSection = forwardRef<{ openAddEditor: () => void }, QueriesSectionProps>(function QueriesSection({ namespace }, ref) {
  const [queries, setQueries] = useState<QueryResponse[]>([]);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>('content'); // NEW
  const router = useRouter();

  useImperativeHandle(ref, () => ({
    openAddEditor: () => {
      router.push(`/query/new?namespace=${namespace}`);
    }
  }));

  const getStatus = (query: QueryResponse) => {
    return (query.status as { phase?: string })?.phase || "pending";
  };

  const {
    data: listQueriesData,
    isLoading: listQueriesLoading,
    isFetching: listQueriesFetching,
    isError: listQueriesError,
    error: listQueriesErrorObject,
    refetch: loadQueries
  } = useListQueries(namespace);

  useEffect(() => {
    if (listQueriesData && !listQueriesError) {
      setQueries(listQueriesData.items);
    }

    if (listQueriesError) {
      toast({
        variant: "destructive",
        title: "Failed to Load Queries",
        description:
          listQueriesErrorObject instanceof Error
            ? listQueriesErrorObject.message
            : "An unexpected error occurred"
      });
    }
  }, [listQueriesError, listQueriesData, listQueriesErrorObject]);

  const truncate = (text: string, maxLen = 120) =>
    text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

  const truncateText = (text: string | undefined, maxLength: number = 120) => {
    if (!text) return "-";
    const newlineIndex = text.indexOf("\n");
    const cutoffIndex =
      newlineIndex > -1 ? Math.min(newlineIndex, maxLength) : maxLength;
    return text.length > cutoffIndex
      ? text.substring(0, cutoffIndex) + "..."
      : text;
  };

  const formatTokenUsage = (query: QueryResponse) => {
    if (!query.status?.tokenUsage) return "-";
    const usage = query.status.tokenUsage as {
      promptTokens?: number;
      completionTokens?: number;
    };
    return `${usage.promptTokens || 0} / ${usage.completionTokens || 0}`;
  };

  const getTargetDisplay = (query: QueryResponse) => {
    const responses = query.status?.responses as
      | Array<{ target?: { name: string; type: string } }>
      | undefined;
    if (!responses || responses.length === 0) return "-";
    const target = responses[0].target;
    if (!target?.type || !target?.name) return "-";
    return `${target.type}:${target.name}`;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedQueries = [...queries].sort((a, b) => {
    if (sortField === "createdAt") {
      const aTime = a.creationTimestamp
        ? new Date(a.creationTimestamp).getTime()
        : 0;
      const bTime = b.creationTimestamp
        ? new Date(b.creationTimestamp).getTime()
        : 0;
      return sortDirection === "desc" ? bTime - aTime : aTime - bTime;
    }
    return 0;
  });

  // Extract first response content (text) if available
  const getFirstResponseText = (query: QueryResponse) => {
    const responses = query.status?.responses as Array<{ content?: string }> | undefined;
    if (!responses || responses.length === 0) return undefined;
    return responses[0].content;
  };

  // Build a small JSON preview string (first response object or status)
  const getFirstResponseJsonPreview = (query: QueryResponse) => {
    const responses = (query.status?.responses as unknown[]) || [];
    const raw = responses.length > 0 ? responses[0] : (query.status ?? query);
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      try {
        return String(raw);
      } catch {
        return "{}";
      }
    }
  };

  // Get output from query - used in the duplicate table section
  const getOutput = (query: QueryResponse) => {
    return getFirstResponseText(query) || "-";
  };

  const renderOutputCell = (query: QueryResponse) => {
    const text = getFirstResponseText(query) || "";
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
            {truncate(preview.replace(/\s+/g, " "), 140)}
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
      | "done"
      | "error"
      | "running"
      | "evaluating"
      | "canceled"
      | "default";
    const variant = [
      "done",
      "error",
      "running",
      "evaluating",
      "canceled"
    ].includes(status || "")
      ? normalizedStatus
      : "default";

    return (
      <StatusDot
        variant={variant}
        onCancel={
          status === "running" ? () => handleCancel(queryName) : undefined
        }
      />
    );
  };

  const handleDelete = async (queryName: string) => {
    try {
      await queriesService.delete(namespace, queryName);
      toast({
        variant: "success",
        title: "Query Deleted",
        description: "Successfully deleted query"
      });
      const data = await queriesService.list(namespace);
      setQueries(data.items);
    } catch (error) {
      console.error("Failed to delete query:", error);
      toast({
        variant: "destructive",
        title: "Failed to Delete Query",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleCancel = async (queryName: string) => {
    try {
      await queriesService.cancel(namespace, queryName);
      toast({
        variant: "success",
        title: "Query Canceled",
        description: "Successfully canceled query"
      });
      const data = await queriesService.list(namespace);
      setQueries(data.items);
    } catch (error) {
      console.error("Failed to cancel query:", error);
      toast({
        variant: "destructive",
        title: "Failed to Cancel Query",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
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
          <main className="flex-1 overflow-auto p-4 space-y-4">
            <div className="ml-auto">
              <Button
                onClick={() => loadQueries()}
                disabled={listQueriesFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${listQueriesFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                      <th
                        className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center">Name</div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center">
                          Age
                          {sortField === "createdAt" &&
                            (sortDirection === "desc" ? (
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
                              className={`px-2 py-1 rounded ${outputViewMode === 'content' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                              onClick={() => setOutputViewMode('content')}
                            >
                              Content
                            </button>
      
                            <button
                              className={`px-2 py-1 rounded ${outputViewMode === 'raw' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}
                              onClick={() => setOutputViewMode('raw')}
                            >
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
                          colSpan={8}
                          className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                          No queries found
                        </td>
                      </tr>
                    ) : (
                      sortedQueries.map((query) => {
                        const target = getTargetDisplay(query);
                        const output = getOutput(query);
                        return (
                          <tr
                            key={query.name}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer"
                            onClick={() =>
                              router.push(
                                `/query/${query.name}?namespace=${namespace}`
                              )
                            }
                          >
                            <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">
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
                                    {truncateText(query.input)}
                                  </TooltipTrigger>
                                  {query.input && query.input.length > 50 && (
                                    <TooltipContent className="max-w-md">
                                      <p className="whitespace-pre-wrap">
                                        {query.input}
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
                            <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100 align-middle">
                              <div className="flex items-center justify-center">
                                <EvaluationStatusIndicator
                                  queryName={query.name}
                                  namespace={namespace}
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const eventsUrl = getResourceEventsUrl(
                                      namespace,
                                      "Query",
                                      query.name
                                    );
                                    window.open(eventsUrl, "_blank");
                                  }}
                                  className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                  title="View query events"
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(query.name);
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                  title="Delete query"
                                >
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
});

interface StatusDotProps {
  variant: "done" | "error" | "running" | "evaluating" | "canceled" | "default";
  onCancel?: () => void;
}

function StatusDot({ variant, onCancel }: StatusDotProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case "done":
        return "bg-green-300";
      case "error":
        return "bg-red-300";
      case "running":
        return "bg-blue-300";
      case "evaluating":
        return "bg-yellow-300";
      case "canceled":
        return "bg-gray-300";
      default:
        return "bg-gray-300";
    }
  };

  const getStatusName = () => {
    switch (variant) {
      case "done":
        return "Done";
      case "error":
        return "Error";
      case "running":
        return "Running";
      case "evaluating":
        return "Evaluating";
      case "canceled":
        return "Canceled";
      default:
        return "Unknown";
    }
  };

  if (variant === "running" && onCancel) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <div className="inline-flex items-center px-4 py-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <span
                className={`inline-flex items-center rounded-full text-xs font-medium w-[16px] h-[16px] ${getVariantClasses()}`}
              />
              <span
                className="ml-2 text-xs text-gray-500 dark:text-gray-400 underline cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                onClick={onCancel}
              >
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
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium w-[16px] h-[16px] ${getVariantClasses()}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{getStatusName()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
