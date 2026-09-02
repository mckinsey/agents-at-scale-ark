import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export function timestampValue(timestamp: string | null | undefined): number {
  if (!timestamp) return 0;
  const value = new Date(timestamp).getTime();

  return Number.isNaN(value) ? 0 : value;
}

export function useValueSort<T>(
  items: readonly T[],
  getValue: (item: T) => number,
  initialDirection: SortDirection = 'desc',
) {
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialDirection);

  const toggleSortDirection = useCallback(
    () => setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc')),
    [],
  );

  const sortedItems = useMemo(() => {
    const direction = sortDirection === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => direction * (getValue(a) - getValue(b)));
  }, [items, getValue, sortDirection]);

  return { sortDirection, toggleSortDirection, sortedItems };
}
