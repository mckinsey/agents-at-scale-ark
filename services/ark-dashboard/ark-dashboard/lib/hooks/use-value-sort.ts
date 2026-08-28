import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export function timestampValue(timestamp: string | null | undefined): number {
  return timestamp ? new Date(timestamp).getTime() : 0;
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
