import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { hasSoftNavigatedAtom } from '@/atoms/navigation-history';

describe('hasSoftNavigatedAtom', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('should default to false', () => {
    const value = store.get(hasSoftNavigatedAtom);
    expect(value).toBe(false);
  });

  it('should be updatable to true', () => {
    store.set(hasSoftNavigatedAtom, true);
    expect(store.get(hasSoftNavigatedAtom)).toBe(true);
  });
});
