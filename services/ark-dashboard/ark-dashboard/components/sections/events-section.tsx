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
  eventsService,
  type Event,
  type EventFilters
} from "@/lib/services/events";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

interface EventsSectionProps {
  readonly namespace: string;
  readonly initialFilters?: Partial<EventFilters>;
}

export function EventsSection({
  namespace,
  initialFilters
}: EventsSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableKinds, setAvailableKinds] = useState<string[]>([]);
  const [availableNames, setAvailableNames] = useState<string[]>([]);

  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialLimit = parseInt(searchParams.get("limit") || "10", 10);
  const initialType = searchParams.get("type") || undefined;
  const initialKind = searchParams.get("kind") || undefined;

  const [totalEvents, setTotalEvents] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(initialLimit);
  const [filters, setFilters] = useState<EventFilters>({
    limit: initialLimit,
    page: initialPage,
    type: initialType,
    kind: initialKind,
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

  const loadEvents = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);

      try {
        const currentFilters: EventFilters = {
          ...filters,
          page: currentPage,
          limit: itemsPerPage
        };

        const [eventsData, filterOptions] = await Promise.all([
          eventsService.getAll(namespace, currentFilters),
          eventsService.getAllFilterOptions(namespace)
        ]);

        setEvents(eventsData.items);
        setTotalEvents(eventsData.total);
        setAvailableTypes(filterOptions.types);
        setAvailableKinds(filterOptions.kinds);
        setAvailableNames(filterOptions.names);
      } catch (error) {
        console.error("Failed to load events:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Events",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
        });
      } finally {
        setLoading(false);
        if (showRefreshing) setRefreshing(false);
      }
    },
    [namespace, filters, currentPage, itemsPerPage]
  );

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
    const limitFromUrl = parseInt(searchParams.get("limit") || "10", 10);
    const typeFromUrl = searchParams.get("type") || undefined;
    const kindFromUrl = searchParams.get("kind") || undefined;
    const nameFromUrl = searchParams.get("name") || undefined;

    const needsUpdate =
      pageFromUrl !== currentPage ||
      limitFromUrl !== itemsPerPage ||
      typeFromUrl !== filters.type ||
      kindFromUrl !== filters.kind ||
      nameFromUrl !== filters.name;

    if (needsUpdate) {
      const newFilters = {
        ...filters,
        page: pageFromUrl,
        limit: limitFromUrl,
        type: typeFromUrl,
        kind: kindFromUrl,
        name: nameFromUrl
      };

      setCurrentPage(pageFromUrl);
      setItemsPerPage(limitFromUrl);
      setFilters(newFilters);
    }
  }, [searchParams, currentPage, itemsPerPage, filters]);

  const handleFilterChange = (
    key: keyof EventFilters,
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
      type: undefined,
      kind: undefined,
      name: undefined
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

  const totalPages = Math.max(1, Math.ceil(totalEvents / itemsPerPage));

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

  const handleEventClick = (event: Event) => {
    router.push(`/event/${event.name}?namespace=${namespace}`);
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

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "Warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "Normal":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case "Warning":
        return <Badge variant="destructive">{type}</Badge>;
      case "Normal":
        return <Badge variant="secondary">{type}</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="border-b flex flex-wrap gap-2 items-center pb-4">
        <Select
          value={filters.type || "all"}
          onValueChange={(value) => handleFilterChange("type", value)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {availableTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.kind || "all"}
          onValueChange={(value) => handleFilterChange("kind", value)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Object Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Kinds</SelectItem>
            {availableKinds.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.name || "all"}
          onValueChange={(value) => handleFilterChange("name", value)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Resource Name" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Names</SelectItem>
            {availableNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
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
              (filters.type && filters.type !== "all") ||
              (filters.kind && filters.kind !== "all") ||
              (filters.name && filters.name !== "all") ||
              (filters.limit !== undefined && filters.limit !== null)
            )
          }
        >
          Clear Filters
        </Button>

        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => loadEvents(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Events Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Age
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resource Kind
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resource Name
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resource UID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-200 dark:divide-gray-800">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No events found
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer transition-colors"
                    onClick={() => handleEventClick(event)}
                  >
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatAge(event.creationTimestamp)}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {getEventTypeIcon(event.type)}
                        {getEventTypeBadge(event.type)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-gray-900 dark:text-gray-100">
                      {event.reason}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-gray-900 dark:text-gray-100">
                      <Badge variant="secondary" className="text-xs">
                        {event.involvedObjectKind}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-gray-900 dark:text-gray-100">
                      <div className="font-medium">
                        {event.involvedObjectName}
                      </div>
                      {event.involvedObjectNamespace &&
                        event.involvedObjectNamespace !== namespace && (
                          <div className="text-gray-500">
                            ns: {event.involvedObjectNamespace}
                          </div>
                        )}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">
                      {event.involvedObjectUid || "-"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-gray-900 dark:text-gray-100">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="text-left">
                            <div className="truncate max-w-md">
                              {event.message}
                            </div>
                          </TooltipTrigger>
                          {event.message && event.message.length > 50 && (
                            <TooltipContent className="max-w-md">
                              <p className="whitespace-pre-wrap">
                                {event.message}
                              </p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
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
