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
  type MemoryFilters,
  type SessionConversation
} from "@/lib/services/memory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Database, ChevronDown, ChevronRight, MessageSquare, User, Bot } from "lucide-react";

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
  const [conversations, setConversations] = useState<SessionConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableMemories, setAvailableMemories] = useState<MemoryResource[]>([]);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

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

        const [messagesData, memoriesData, conversationsData] = await Promise.all([
          memoryService.getAllSessions(namespace, currentFilters),
          memoryService.getMemoryResources(namespace),
          memoryService.getAllConversations(namespace, currentFilters)
        ]);

        setMessages(messagesData.items);
        setTotalMessages(messagesData.total);
        setAvailableMemories(memoriesData);
        setConversations(conversationsData);

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

  const toggleSessionExpansion = (sessionKey: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionKey)) {
        newSet.delete(sessionKey);
      } else {
        newSet.add(sessionKey);
      }
      return newSet;
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

      {/* Memory Sessions with Conversations */}
      <div className="space-y-4">
        {conversations.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">No memory sessions found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Create queries with memory configuration to see conversation history
            </p>
          </div>
        ) : (
          conversations.map((conversation) => {
            const sessionKey = `${conversation.memoryName}:${conversation.sessionId}`;
            const isExpanded = expandedSessions.has(sessionKey);
            const relatedQueries = messages.filter(
              m => m.sessionId === conversation.sessionId && m.memoryName === conversation.memoryName
            );

            return (
              <div key={sessionKey} className="border rounded-lg bg-white dark:bg-gray-950">
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors flex items-center justify-between"
                  onClick={() => toggleSessionExpansion(sessionKey)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="h-4 w-4 text-gray-500" />
                        <Badge variant="secondary" className="font-mono">
                          {conversation.memoryName}
                        </Badge>
                        <MessageSquare className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {conversation.messages.length} messages
                        </span>
                      </div>
                      <div className="font-mono text-sm text-gray-700 dark:text-gray-300">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="text-left">
                              <div className="truncate max-w-96">
                                Session: {conversation.sessionId}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono">{conversation.sessionId}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {relatedQueries.length} {relatedQueries.length === 1 ? 'query' : 'queries'}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="border-t">
                    {/* Related Queries */}
                    {relatedQueries.length > 0 && (
                      <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Related Queries</h4>
                        <div className="space-y-2">
                          {relatedQueries.map((query) => (
                            <div key={query.uid} className="flex items-center justify-between text-sm">
                              <div className="font-mono">{query.queryName}</div>
                              <div className="flex items-center gap-2">
                                <Badge variant={query.status === "done" ? "secondary" : "outline"} className="text-xs">
                                  {query.status}
                                </Badge>
                                {query.timestamp && (
                                  <span className="text-gray-500">{formatAge(query.timestamp)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Conversation Messages */}
                    <div className="p-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Conversation History</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {conversation.messages.map((message, index) => (
                          <div key={index} className={`flex gap-3 ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}>
                            <div className={`flex gap-2 max-w-lg ${
                              message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                            }`}>
                              <div className={`p-2 rounded-lg ${
                                message.role === 'user' 
                                  ? 'bg-blue-100 dark:bg-blue-900/30' 
                                  : 'bg-gray-100 dark:bg-gray-800'
                              }`}>
                                {message.role === 'user' ? (
                                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <Bot className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                )}
                              </div>
                              <div className={`p-3 rounded-lg text-sm ${
                                message.role === 'user'
                                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100'
                              }`}>
                                <div className="whitespace-pre-wrap">{message.content}</div>
                                {message.name && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                                    {message.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
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