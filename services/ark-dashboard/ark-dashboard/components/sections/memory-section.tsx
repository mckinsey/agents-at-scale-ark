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
  type MemoryResource,
  type MemoryFilters,
  type SessionConversation
} from "@/lib/services/memory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Database, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";

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

  const [conversations, setConversations] = useState<SessionConversation[]>([]);
  const [memoryQueries, setMemoryQueries] = useState<MemoryMessage[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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

        const [memoriesData, conversationsData] = await Promise.all([
          memoryService.getMemoryResources(namespace),
          memoryService.getAllConversations(namespace, currentFilters)
        ]);
        // Calculate total messages across all conversations
        const totalMessages = conversationsData.conversations.reduce((total, conv) => total + conv.messages.length, 0);
        setTotalMessages(totalMessages);
        setAvailableMemories(memoriesData);
        setConversations(conversationsData.conversations);

        // Extract unique session IDs for filtering
        const sessionIds = new Set(conversationsData.conversations.map(c => c.sessionId));
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

  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

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

      {/* Messages Table */}
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Memory
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Session
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-200 dark:divide-gray-800">
              {conversations.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-6 text-center text-xs text-gray-500 dark:text-gray-400"
                  >
                    <div className="flex flex-col items-center">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>No messages found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                conversations.flatMap((conversation) =>
                  conversation.messages.map((message, index) => (
                    <tr
                      key={`${conversation.sessionId}-${index}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                    >
                      <td className="px-2 py-2 text-xs">
                        {conversation.memoryName}
                      </td>
                      <td className="px-2 py-2 text-xs font-mono">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-left">
                              <div className="truncate max-w-24">
                                {conversation.sessionId}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono text-xs">{conversation.sessionId}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-600 dark:text-gray-400">
                            {message.role}{message.name && ` (${message.name})`}
                          </div>
                          <div className="text-gray-900 dark:text-gray-100">
                            {message.content}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )
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