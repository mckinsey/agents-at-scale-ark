"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
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
  type MemoryFilters
} from "@/lib/services/memory";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";

import { Database, MessageSquare, ChevronDown } from "lucide-react";

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

  const [memoryMessages, setMemoryMessages] = useState<{
    timestamp: string;
    memoryName: string;
    sessionId: string;
    queryId: string;
    message: { role: string; content: string; name?: string };
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableMemories, setAvailableMemories] = useState<MemoryResource[]>([]);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [availableQueries, setAvailableQueries] = useState<string[]>([]);
  
  const [memoryFilter, setMemoryFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [memoryDropdownOpen, setMemoryDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [queryDropdownOpen, setQueryDropdownOpen] = useState(false);
  
  const memoryFilterRef = useRef<HTMLInputElement>(null);
  const sessionFilterRef = useRef<HTMLInputElement>(null);
  const queryFilterRef = useRef<HTMLInputElement>(null);

  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialLimit = parseInt(searchParams.get("limit") || "10", 10);
  const initialMemory = searchParams.get("memory") || undefined;
  const initialSessionId = searchParams.get("sessionId") || undefined;
  const initialQueryId = searchParams.get("queryId") || undefined;

  const [totalMessages, setTotalMessages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(initialLimit);
  const [filters, setFilters] = useState<MemoryFilters>({
    limit: initialLimit,
    page: initialPage,
    memoryName: initialMemory,
    sessionId: initialSessionId,
    queryId: initialQueryId,
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
        const [memoriesData, sessionsData, messagesData] = await Promise.all([
          memoryService.getMemoryResources(namespace),
          memoryService.getSessions(namespace),
          memoryService.getAllMemoryMessages(namespace, {
            memory: filters.memoryName && filters.memoryName !== "all" ? filters.memoryName : undefined,
            session: filters.sessionId && filters.sessionId !== "all" ? filters.sessionId : undefined,
            query: filters.queryId && filters.queryId !== "all" ? filters.queryId : undefined
          })
        ]);
        
        // Sort messages by timestamp (newest first)
        const sortedMessages = messagesData.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
    [namespace, filters]
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
    const limitFromUrl = parseInt(searchParams.get("limit") || "10", 10);
    const memoryFromUrl = searchParams.get("memory") || undefined;
    const sessionFromUrl = searchParams.get("sessionId") || undefined;
    const queryFromUrl = searchParams.get("queryId") || undefined;

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
        queryId: queryFromUrl
      });
    }
  }, [searchParams, currentPage, itemsPerPage, filters.memoryName, filters.sessionId, filters.queryId]);

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
      memory.name.toLowerCase().includes(memoryFilter.toLowerCase())
    );
  }, [availableMemories, memoryFilter]);
  
  const filteredSessions = useMemo(() => {
    return availableSessions.filter(session =>
      session.toLowerCase().includes(sessionFilter.toLowerCase())
    );
  }, [availableSessions, sessionFilter]);
  
  const filteredQueries = useMemo(() => {
    return availableQueries.filter(query =>
      query.toLowerCase().includes(queryFilter.toLowerCase())
    );
  }, [availableQueries, queryFilter]);

  const handleFilterChange = (
    key: keyof MemoryFilters,
    value: string | undefined
  ) => {
    const effectiveValue = value === "all" ? undefined : value;

    // Update URL params immediately
    updateUrlParams({
      [key]: effectiveValue,
      page: 1
    });
  };

  const clearFilters = () => {
    // Only update URL - let the useEffect handle state updates
    updateUrlParams({
      page: 1,
      limit: itemsPerPage,
      memoryName: undefined,
      sessionId: undefined,
      queryId: undefined
    });
  };

  const handlePageChange = (newPage: number) => {
    // Only update URL - let the useEffect handle state updates
    updateUrlParams({ page: newPage });
  };

  const totalPages = Math.max(1, Math.ceil(totalMessages / itemsPerPage));
  
  // Apply client-side pagination to the sorted messages
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedMessages = memoryMessages.slice(startIndex, startIndex + itemsPerPage);
  
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
        hour12: false
      });
    } catch {
      return timestamp;
    }
  };
  


  const handleItemsPerPageChange = (newLimit: number) => {
    // Only update URL - let the useEffect handle state updates
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
        <DropdownMenu open={memoryDropdownOpen} onOpenChange={setMemoryDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-48 justify-between text-sm h-9 font-normal min-w-0">
              <span className={`truncate min-w-0 ${!searchParams.get("memory") || searchParams.get("memory") === "all" ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get("memory") || searchParams.get("memory") === "all" 
                  ? "All Memories" 
                  : searchParams.get("memory")
                }
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="start">
            <div className="p-2">
              <Input
                ref={memoryFilterRef}
                placeholder="Filter memories..."
                value={memoryFilter}
                onChange={(e) => setMemoryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div 
                className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  updateUrlParams({ memory: undefined, page: 1 });
                  setMemoryDropdownOpen(false);
                }}
              >
                All Memories
              </div>
              {filteredMemories.map((memory) => (
                <div 
                  key={memory.name}
                  className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    updateUrlParams({ memory: memory.name, page: 1 });
                    setMemoryDropdownOpen(false);
                  }}
                >
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

        <DropdownMenu open={sessionDropdownOpen} onOpenChange={setSessionDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-64 justify-between text-sm h-9 font-normal min-w-0">
              <span className={`truncate min-w-0 ${!searchParams.get("sessionId") || searchParams.get("sessionId") === "all" ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get("sessionId") || searchParams.get("sessionId") === "all" 
                  ? "All Sessions" 
                  : (searchParams.get("sessionId")!.length > 30 ? `${searchParams.get("sessionId")!.substring(0, 30)}...` : searchParams.get("sessionId"))
                }
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                ref={sessionFilterRef}
                placeholder="Filter sessions..."
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div 
                className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  handleFilterChange("sessionId", "all");
                  setSessionDropdownOpen(false);
                }}
              >
                All Sessions
              </div>
              {filteredSessions.map((sessionId) => (
                <div 
                  key={sessionId}
                  className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    handleFilterChange("sessionId", sessionId);
                    setSessionDropdownOpen(false);
                  }}
                >
                  {sessionId.length > 30 ? `${sessionId.substring(0, 30)}...` : sessionId}
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

        <DropdownMenu open={queryDropdownOpen} onOpenChange={setQueryDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-64 justify-between text-sm h-9 font-normal min-w-0">
              <span className={`truncate min-w-0 ${!searchParams.get("queryId") || searchParams.get("queryId") === "all" ? 'text-muted-foreground' : ''}`}>
                {!searchParams.get("queryId") || searchParams.get("queryId") === "all" 
                  ? "All Queries" 
                  : (searchParams.get("queryId")!.length > 30 ? `${searchParams.get("queryId")!.substring(0, 30)}...` : searchParams.get("queryId"))
                }
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <div className="p-2">
              <Input
                ref={queryFilterRef}
                placeholder="Filter queries..."
                value={queryFilter}
                onChange={(e) => setQueryFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-auto">
              <div 
                className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  handleFilterChange("queryId", "all");
                  setQueryDropdownOpen(false);
                }}
              >
                All Queries
              </div>
              {filteredQueries.map((queryId) => (
                <div 
                  key={queryId}
                  className="flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    handleFilterChange("queryId", queryId);
                    setQueryDropdownOpen(false);
                  }}
                >
                  {queryId.length > 30 ? `${queryId.substring(0, 30)}...` : queryId}
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
              (filters.memoryName && filters.memoryName !== "all") ||
              (filters.sessionId && filters.sessionId !== "all") ||
              (filters.queryId && filters.queryId !== "all")
            )
          }
        >
          Clear Filters
        </Button>
      </div>

      {/* Messages Table */}
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Memory
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Session
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-200 dark:divide-gray-800">
              {paginatedMessages.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-xs text-gray-500 dark:text-gray-400"
                  >
                    <div className="flex flex-col items-center">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>No messages found</p>
                      {totalMessages > 0 && (
                        <p className="mt-1 text-xs text-gray-400">
                          Try adjusting your filters or page selection
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedMessages.map((messageRecord, index) => (
                  <tr
                    key={`${messageRecord.sessionId}-${messageRecord.queryId}-${index}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="px-3 py-3 text-xs font-mono text-gray-600 dark:text-gray-300">
                      {formatTimestamp(messageRecord.timestamp)}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      <div className="truncate max-w-20">
                        {messageRecord.memoryName}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="truncate max-w-24">
                              {messageRecord.sessionId}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{messageRecord.sessionId}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="truncate max-w-24">
                              {messageRecord.queryId}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{messageRecord.queryId}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      <pre className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
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
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {paginatedMessages.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, totalMessages)} of {totalMessages} messages
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