import { generateUUID } from '@/lib/utils/uuid';

export interface StreamEntry {
  id: string;
  timestamp: string;
  data: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
}

export function extractItemTimestamp(item: unknown): string {
  if (!item) {
    return new Date().toISOString();
  }
  const typedItem = item as Record<string, unknown>;
  if (typedItem.timestamp) {
    return typedItem.timestamp as string;
  }
  let unixTimestamp = '';
  if (typedItem?.startTimeUnixNano) {
    unixTimestamp = typedItem.startTimeUnixNano as string;
  }
  const spans = typedItem?.spans as Array<Record<string, unknown>>;
  if (!unixTimestamp && spans && spans.length > 0) {
    unixTimestamp = spans[0].startTimeUnixNano as string;
  }
  if (unixTimestamp) {
    return new Date(parseInt(unixTimestamp.substring(0, 13))).toISOString();
  }
  return new Date().toISOString();
}

export function createStreamEntryId(prefix?: string): string {
  return prefix ? `${prefix}-${generateUUID()}` : generateUUID();
}
