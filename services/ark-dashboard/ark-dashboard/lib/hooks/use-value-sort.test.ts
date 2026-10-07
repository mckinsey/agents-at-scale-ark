import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { timestampValue, useValueSort } from './use-value-sort';

let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (target: string) => {
      currentParams = new URLSearchParams(target.split('?')[1] ?? '');
    },
    push: vi.fn(),
  }),
  usePathname: () => '/queries',
  useSearchParams: () => currentParams,
}));

interface Row {
  readonly id: string;
  readonly createdAt?: string;
}

const getCreatedTime = (row: Row) => timestampValue(row.createdAt);

const rows: Row[] = [
  { id: 'middle', createdAt: '2024-06-01T00:00:00Z' },
  { id: 'newest', createdAt: '2025-01-01T00:00:00Z' },
  { id: 'undated' },
  { id: 'oldest', createdAt: '2023-01-01T00:00:00Z' },
];

const ids = (items: readonly Row[]) => items.map(row => row.id);

describe('timestampValue', () => {
  it('returns 0 for a missing timestamp', () => {
    expect(timestampValue(undefined)).toBe(0);
    expect(timestampValue(null)).toBe(0);
  });

  it('returns 0 for an unparseable timestamp so the comparator stays consistent', () => {
    expect(timestampValue('garbage')).toBe(0);
    expect(timestampValue('2023-13-45')).toBe(0);
  });

  it('returns epoch milliseconds for a timestamp', () => {
    expect(timestampValue('2024-06-01T00:00:00Z')).toBe(
      new Date('2024-06-01T00:00:00Z').getTime(),
    );
  });
});

const renderSort = <T>(
  items: readonly T[],
  getValue: (item: T) => number,
  initialDirection?: 'asc' | 'desc',
) => {
  const view = renderHook(() =>
    useValueSort(items, getValue, initialDirection),
  );
  return {
    get current() {
      return view.result.current;
    },
    toggle: () => {
      act(() => view.result.current.toggleSortDirection());
      view.rerender();
    },
  };
};

describe('useValueSort', () => {
  beforeEach(() => {
    currentParams = new URLSearchParams();
  });

  it('sorts newest first by default', () => {
    const sort = renderSort(rows, getCreatedTime);

    expect(sort.current.sortDirection).toBe('desc');
    expect(ids(sort.current.sortedItems)).toEqual([
      'newest',
      'middle',
      'oldest',
      'undated',
    ]);
  });

  it('toggles between newest first and oldest first', () => {
    const sort = renderSort(rows, getCreatedTime);

    sort.toggle();

    expect(sort.current.sortDirection).toBe('asc');
    expect(ids(sort.current.sortedItems)).toEqual([
      'undated',
      'oldest',
      'middle',
      'newest',
    ]);

    sort.toggle();

    expect(sort.current.sortDirection).toBe('desc');
    expect(ids(sort.current.sortedItems)[0]).toBe('newest');
  });

  it('honours the initial direction', () => {
    const sort = renderSort(rows, getCreatedTime, 'asc');

    expect(sort.current.sortDirection).toBe('asc');
    expect(ids(sort.current.sortedItems)[0]).toBe('undated');
  });

  it('keeps rows with a broken date from disturbing the rest of the order', () => {
    const withBroken: Row[] = [
      { id: 'middle', createdAt: '2024-06-01T00:00:00Z' },
      { id: 'broken', createdAt: 'garbage' },
      { id: 'newest', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'oldest', createdAt: '2023-01-01T00:00:00Z' },
    ];
    const sort = renderSort(withBroken, getCreatedTime);

    expect(ids(sort.current.sortedItems)).toEqual([
      'newest',
      'middle',
      'oldest',
      'broken',
    ]);
  });

  it('keeps ties in source order in both directions', () => {
    const tied: Row[] = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
    const sort = renderSort(tied, getCreatedTime);

    expect(ids(sort.current.sortedItems)).toEqual(['first', 'second', 'third']);

    sort.toggle();

    expect(ids(sort.current.sortedItems)).toEqual(['first', 'second', 'third']);
  });

  it('leaves the source array untouched', () => {
    const source = [...rows];
    renderSort(source, getCreatedTime);

    expect(ids(source)).toEqual(ids(rows));
  });

  it('reads the direction from the URL so a shared link sorts the same way', () => {
    currentParams = new URLSearchParams('sort=asc');

    const sort = renderSort(rows, getCreatedTime);

    expect(sort.current.sortDirection).toBe('asc');
    expect(ids(sort.current.sortedItems)[0]).toBe('undated');
  });

  it('writes the direction to the URL so it survives leaving the screen', () => {
    const sort = renderSort(rows, getCreatedTime);

    sort.toggle();

    expect(currentParams.get('sort')).toBe('asc');
  });

  it('falls back to the initial direction for an unusable URL value', () => {
    currentParams = new URLSearchParams('sort=sideways');

    const sort = renderSort(rows, getCreatedTime);

    expect(sort.current.sortDirection).toBe('desc');
  });

  it('keeps the direction under a caller-supplied param key', () => {
    const view = renderHook(() =>
      useValueSort(rows, getCreatedTime, 'desc', 'messageSort'),
    );

    act(() => view.result.current.toggleSortDirection());

    expect(currentParams.get('messageSort')).toBe('asc');
    expect(currentParams.has('sort')).toBe(false);
  });
});
