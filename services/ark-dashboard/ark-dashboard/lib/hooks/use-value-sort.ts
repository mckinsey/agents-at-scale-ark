'use client';

import { useCallback, useMemo } from 'react';

import { useUrlState } from '@/lib/hooks/use-url-state';

export type SortDirection = 'asc' | 'desc';

const DEFAULT_SORT_PARAM = 'sort';

export function timestampValue(timestamp: string | null | undefined): number {
  if (!timestamp) return 0;
  const value = new Date(timestamp).getTime();

  return Number.isNaN(value) ? 0 : value;
}

export function useValueSort<T>(
  items: readonly T[],
  getValue: (item: T) => number,
  initialDirection: SortDirection = 'desc',
  paramKey: string = DEFAULT_SORT_PARAM,
) {
  const [values, setValues] = useUrlState({
    [paramKey]: {
      default: initialDirection,
      parse: (raw: string): SortDirection =>
        raw === 'asc' || raw === 'desc' ? raw : initialDirection,
    },
  });
  const sortDirection = values[paramKey];

  const toggleSortDirection = useCallback(
    () => setValues({ [paramKey]: sortDirection === 'desc' ? 'asc' : 'desc' }),
    [paramKey, setValues, sortDirection],
  );

  const sortedItems = useMemo(() => {
    const direction = sortDirection === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => direction * (getValue(a) - getValue(b)));
  }, [items, getValue, sortDirection]);

  return { sortDirection, toggleSortDirection, sortedItems };
}
