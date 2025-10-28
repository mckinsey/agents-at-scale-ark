import { apiClient } from '@/lib/api/client';

// Event interface for UI compatibility
export interface Event {
  id: string;
  name: string;
  namespace: string;
  type: string; // Normal, Warning
  reason: string;
  message: string;
  sourceComponent?: string;
  sourceHost?: string;
  involvedObjectKind: string;
  involvedObjectName: string;
  involvedObjectNamespace?: string;
  involvedObjectUid?: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  count: number;
  creationTimestamp: string;
  uid: string;
}

// API response interface
interface EventApiResponse {
  id?: string;
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source_component?: string;
  source_host?: string;
  involved_object_kind: string;
  involved_object_name: string;
  involved_object_namespace?: string;
  involved_object_uid?: string;
  first_timestamp?: string;
  last_timestamp?: string;
  count: number;
  creation_timestamp: string;
  uid: string;
}

// Event list response
interface EventListResponse {
  items: EventApiResponse[];
  total: number;
}

// Event filter options
export interface EventFilters {
  type?: string;
  kind?: string;
  name?: string;
  limit?: number;
  page?: number;
}

// Helper function to build URL parameters
function buildEventApiParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.type) {
    params.append('type', filters.type);
  }
  if (filters.kind) {
    params.append('kind', filters.kind);
  }
  if (filters.name) {
    params.append('name', filters.name);
  }
  if (filters.limit) {
    params.append('limit', filters.limit.toString());
  }
  if (filters.page !== undefined) {
    params.append('page', filters.page.toString());
  } else {
    params.append('page', '1');
  }

  return params;
}

// Helper function to log API request details
function logApiRequest(
  filters: EventFilters,
  params: URLSearchParams,
  url: string,
): void {
  console.log('Building events API request with params:', {
    filters,
    paramsEntries: [...params.entries()].map(([k, v]) => `${k}=${v}`),
    originalParams: params.toString(),
  });
  console.log('Final API URL:', url);
}

// Helper function to log API response details
function logApiResponse(url: string, response: EventListResponse | null): void {
  console.log('Events API response:', {
    url,
    hasItems: !!response?.items,
    itemsCount: response?.items?.length ?? 0,
    totalProvided: response?.total,
    responseKeys: response ? Object.keys(response) : [],
    responseItems: response?.items ? response.items.length : 0,
  });
}

// Helper function to map API response to Event interface
function mapEventApiResponseToEvent(response: EventApiResponse): Event {
  return {
    id: response.uid ?? response.name ?? '',
    name: response.name ?? '',
    namespace: response.namespace ?? '',
    type: response.type ?? '',
    reason: response.reason ?? '',
    message: response.message ?? '',
    sourceComponent: response.source_component ?? undefined,
    sourceHost: response.source_host ?? undefined,
    involvedObjectKind: response.involved_object_kind ?? '',
    involvedObjectName: response.involved_object_name ?? '',
    involvedObjectNamespace: response.involved_object_namespace ?? undefined,
    involvedObjectUid: response.involved_object_uid ?? undefined,
    firstTimestamp: response.first_timestamp ?? undefined,
    lastTimestamp: response.last_timestamp ?? undefined,
    count: response.count ?? 0,
    creationTimestamp: response.creation_timestamp ?? '',
    uid: response.uid ?? '',
  };
}

// Helper function to calculate total count with fallback logic
function calculateTotalCount(
  response: EventListResponse,
  filters: EventFilters,
  itemsLength: number,
): number {
  let totalCount = response.total;

  if (totalCount === undefined || totalCount === null) {
    if (
      filters.limit &&
      ((filters.page && filters.page > 1) || itemsLength >= filters.limit)
    ) {
      totalCount = (filters.page ?? 1) * itemsLength;
    } else {
      totalCount = itemsLength;
    }
  }

  return totalCount;
}

export const eventsService = {
  // Get all events with optional filters
  async getAll(
    filters?: EventFilters,
  ): Promise<{ items: Event[]; total: number }> {
    try {
      const effectiveFilters = filters || {};
      const params = buildEventApiParams(effectiveFilters);

      const queryString = params.toString();
      const url = `/api/v1/events${queryString ? `?${queryString}` : ''}`;

      logApiRequest(effectiveFilters, params, url);

      const response = await apiClient.get<EventListResponse>(url);

      logApiResponse(url, response);

      if (!response?.items) {
        return { items: [], total: 0 };
      }

      const items = response.items.map(mapEventApiResponseToEvent);
      const totalCount = calculateTotalCount(
        response,
        effectiveFilters,
        items.length,
      );

      return {
        items,
        total: totalCount,
      };
    } catch (error) {
      console.error('Failed to fetch events:', error);
      return { items: [], total: 0 };
    }
  },

  // Get a single event by name
  async get(eventName: string): Promise<Event> {
    try {
      const url = `/api/v1/events/${eventName}`;
      const response = await apiClient.get<EventApiResponse>(url);

      return mapEventApiResponseToEvent(response);
    } catch (error) {
      console.error(`Failed to fetch event ${eventName}:`, error);
      throw error;
    }
  },

  // Helper to fetch events for filter population
  async _getEventsForFilters(): Promise<Event[]> {
    try {
      const result = await this.getAll({ limit: 200 });
      return result.items;
    } catch (error) {
      console.error('Failed to fetch events for filters:', error);
      return [];
    }
  },

  // Get all filter options
  async getAllFilterOptions(): Promise<{
    types: string[];
    kinds: string[];
    names: string[];
  }> {
    try {
      const events = await this._getEventsForFilters();

      const types = new Set(events.map(event => event.type).filter(Boolean));
      const kinds = new Set(
        events.map(event => event.involvedObjectKind).filter(Boolean),
      );
      const names = new Set(
        events.map(event => event.involvedObjectName).filter(Boolean),
      );

      return {
        types: Array.from(types).sort((a, b) => a.localeCompare(b)),
        kinds: Array.from(kinds).sort((a, b) => a.localeCompare(b)),
        names: Array.from(names).sort((a, b) => a.localeCompare(b)),
      };
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
      return {
        types: [],
        kinds: [],
        names: [],
      };
    }
  },
};
