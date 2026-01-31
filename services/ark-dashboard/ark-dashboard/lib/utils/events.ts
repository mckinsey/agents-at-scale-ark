import type { EventFilters } from '@/lib/services/events';

/**
 * URL for the broker page (replaces the former events page for diagnostic view).
 */
export function getEventsPageUrl(_filters?: Partial<EventFilters>): string {
  return '/broker';
}

/**
 * URL for the broker page (replaces the former events page for resource diagnostics).
 */
export function getResourceEventsUrl(
  _resourceKind: string,
  _resourceName: string,
): string {
  return '/broker';
}
