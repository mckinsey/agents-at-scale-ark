import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { timestampValue, useValueSort } from './use-value-sort';

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

describe('useValueSort', () => {
  it('sorts newest first by default', () => {
    const { result } = renderHook(() => useValueSort(rows, getCreatedTime));

    expect(result.current.sortDirection).toBe('desc');
    expect(ids(result.current.sortedItems)).toEqual([
      'newest',
      'middle',
      'oldest',
      'undated',
    ]);
  });

  it('toggles between newest first and oldest first', () => {
    const { result } = renderHook(() => useValueSort(rows, getCreatedTime));

    act(() => result.current.toggleSortDirection());

    expect(result.current.sortDirection).toBe('asc');
    expect(ids(result.current.sortedItems)).toEqual([
      'undated',
      'oldest',
      'middle',
      'newest',
    ]);

    act(() => result.current.toggleSortDirection());

    expect(result.current.sortDirection).toBe('desc');
    expect(ids(result.current.sortedItems)[0]).toBe('newest');
  });

  it('honours the initial direction', () => {
    const { result } = renderHook(() =>
      useValueSort(rows, getCreatedTime, 'asc'),
    );

    expect(result.current.sortDirection).toBe('asc');
    expect(ids(result.current.sortedItems)[0]).toBe('undated');
  });

  it('keeps rows with a broken date from disturbing the rest of the order', () => {
    const withBroken: Row[] = [
      { id: 'middle', createdAt: '2024-06-01T00:00:00Z' },
      { id: 'broken', createdAt: 'garbage' },
      { id: 'newest', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'oldest', createdAt: '2023-01-01T00:00:00Z' },
    ];
    const { result } = renderHook(() =>
      useValueSort(withBroken, getCreatedTime),
    );

    expect(ids(result.current.sortedItems)).toEqual([
      'newest',
      'middle',
      'oldest',
      'broken',
    ]);
  });

  it('keeps ties in source order in both directions', () => {
    const tied: Row[] = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
    const { result } = renderHook(() => useValueSort(tied, getCreatedTime));

    expect(ids(result.current.sortedItems)).toEqual([
      'first',
      'second',
      'third',
    ]);

    act(() => result.current.toggleSortDirection());

    expect(ids(result.current.sortedItems)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('leaves the source array untouched', () => {
    const source = [...rows];
    renderHook(() => useValueSort(source, getCreatedTime));

    expect(ids(source)).toEqual(ids(rows));
  });
});
