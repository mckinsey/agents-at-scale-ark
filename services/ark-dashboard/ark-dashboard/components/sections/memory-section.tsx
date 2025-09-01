"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import {
  memoryService,
  type MemoryMessage,
  type MemoryResource,
  type MemoryFilters
} from "@/lib/services/memory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Database } from "lucide-react";

interface MemorySectionProps {
  readonly namespace: string;
  readonly initialFilters?: Partial<MemoryFilters>;
}

export function MemorySection({
  namespace,
  initialFilters
}: MemorySectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableMemories, setAvailableMemories] = useState<MemoryResource[]>([]);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);

  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialLimit = parseInt(searchParams.get("limit") || "10", 10);
  const initialMemory = searchParams.get("memory") || undefined;
  const initialSessionId = searchParams.get("sessionId") || undefined;

  const [totalMessages, setTotalMessages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(initialLimit);
  const [filters, setFilters] = useState<MemoryFilters>({
    limit: initialLimit,
    page: initialPage,
    memoryName: initialMemory,
    sessionId: initialSessionId,
    ...initialFilters
  });

  const updateUrlParams = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString());

      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });

      const newUrl =
        pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.push(newUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const loadMessages = useCallback(
    async () => {
      setLoading(true);

      try {
        const currentFilters: MemoryFilters = {
          ...filters,
          page: currentPage,
          limit: itemsPerPage
        };

        const [messagesData, memoriesData] = await Promise.all([
          memoryService.getAllSessions(namespace, currentFilters),
          memoryService.getMemoryResources(namespace)
        ]);

        setMessages(messagesData.items);
        setTotalMessages(messagesData.total);
        setAvailableMemories(memoriesData);

        // Extract unique session IDs for filtering
        const sessionIds = new Set(messagesData.items.map(m => m.sessionId));
        setAvailableSessions(Array.from(sessionIds).sort());

      } catch (error) {
        console.error("Failed to load memory messages:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Memory Messages",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
        });
      } finally {
        setLoading(false);
      }
    },
    [namespace, filters, currentPage, itemsPerPage]
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
    const limitFromUrl = parseInt(searchParams.get("limit") || "10", 10);
    const memoryFromUrl = searchParams.get("memory") || undefined;
    const sessionFromUrl = searchParams.get("sessionId") || undefined;

    const needsUpdate =
      pageFromUrl !== currentPage ||
      limitFromUrl !== itemsPerPage ||
      memoryFromUrl !== filters.memoryName ||
      sessionFromUrl !== filters.sessionId;

    if (needsUpdate) {
      const newFilters = {
        ...filters,
        page: pageFromUrl,
        limit: limitFromUrl,
        memoryName: memoryFromUrl,
        sessionId: sessionFromUrl
      };

      setCurrentPage(pageFromUrl);
      setItemsPerPage(limitFromUrl);
      setFilters(newFilters);
    }
  }, [searchParams, currentPage, itemsPerPage, filters]);

  const handleFilterChange = (
    key: keyof MemoryFilters,
    value: string | undefined
  ) => {
    const effectiveValue = value === "all" ? undefined : value;

    setFilters((prev) => ({
      ...prev,
      [key]: effectiveValue,
      page: 1
    }));
    setCurrentPage(1);

    updateUrlParams({
      [key]: effectiveValue,
      page: 1
    });
  };

  const clearFilters = () => {
    setFilters({ limit: itemsPerPage, page: 1 });
    setCurrentPage(1);

    updateUrlParams({
      page: 1,
      limit: itemsPerPage,
      memory: undefined,
      sessionId: undefined
    });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setFilters((prev) => ({
      ...prev,
      page: newPage
    }));

    updateUrlParams({ page: newPage });
  };

  const totalPages = Math.max(1, Math.ceil(totalMessages / itemsPerPage));

  const handleItemsPerPageChange = (newLimit: number) => {
    setItemsPerPage(newLimit);
    setCurrentPage(1);

    setFilters((prev) => ({
      ...prev,
      limit: newLimit,
      page: 1
    }));

    updateUrlParams({
      limit: newLimit,
      page: 1
    });
  };

  const formatAge = (timestamp: string) => {
    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffMs = now.getTime() - eventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return "now";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Database className="h-8 w-8 animate-pulse mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading memory messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-4 items-center">
        <Select
          value={filters.memoryName || "all"}
          onValueChange={(value) => handleFilterChange("memoryName", value)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Memory Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Memories</SelectItem>
            {availableMemories.map((memory) => (
              <SelectItem key={memory.name} value={memory.name}>
                {memory.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.sessionId || "all"}
          onValueChange={(value) => handleFilterChange("sessionId", value)}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Session ID" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {availableSessions.map((sessionId) => (
              <SelectItem key={sessionId} value={sessionId}>
                {sessionId.length > 30 ? `${sessionId.substring(0, 30)}...` : sessionId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          disabled={
            !(
              (filters.memoryName && filters.memoryName !== "all") ||
              (filters.sessionId && filters.sessionId !== "all")
            )
          }
        >
          Clear Filters
        </Button>
      </div>

      {/* Memory Messages Table */}
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Query Name
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Memory Resource
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Session ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Input
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Age
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-200 dark:divide-gray-800">
              {messages.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No memory messages found
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr
                    key={message.uid}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="font-mono font-medium">
                        {message.queryName}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-gray-500" />
                        <Badge variant="secondary" className="font-mono">
                          {message.memoryName}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="font-mono text-xs">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-left">
                              <div className="truncate max-w-48">
                                {message.sessionId}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono">{message.sessionId}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="truncate max-w-64">
                              {message.input}
                            </div>
                          </TooltipTrigger>
                          {message.input.length > 50 && (
                            <TooltipContent className="max-w-md">
                              <p className="whitespace-pre-wrap text-sm">
                                {message.input}
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <Badge variant={message.status === "succeeded" ? "secondary" : "outline"} className="font-mono">
                        {message.status || "unknown"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {message.timestamp ? formatAge(message.timestamp) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  );
}