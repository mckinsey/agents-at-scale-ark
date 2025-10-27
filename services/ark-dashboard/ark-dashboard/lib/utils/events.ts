import type { EventFilters } from '@/lib/services/events';

/**
 * Utility function to generate events page URL with filters
 * @param namespace - The namespace to filter events by
 * @param filters - Optional filters to apply (type, kind, name)
 * @returns URL string for the events page with query parameters
 */
export function getEventsPageUrl(filters?: Partial<EventFilters>): string {
  const params = new URLSearchParams();

  if (filters?.type) params.set('type', filters.type);
  if (filters?.kind) params.set('kind', filters.kind);
  if (filters?.name) params.set('name', filters.name);

  return `/events?${params.toString()}`;
}

/**
 * Generate events page URL filtered by resource kind and name
 * @param namespace - The namespace
 * @param resourceKind - The Kubernetes resource kind (e.g., "Query", "Agent", "Model")
 * @param resourceName - The resource name
 * @returns URL string for filtered events page
 */
export function getResourceEventsUrl(
  resourceKind: string,
  resourceName: string,
): string {
  return getEventsPageUrl({
    kind: resourceKind,
    name: resourceName,
  });
}
