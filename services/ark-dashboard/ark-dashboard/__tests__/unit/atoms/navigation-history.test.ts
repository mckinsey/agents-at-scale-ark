import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';

describe('settingsEntryUrlAtom', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('should default to null', () => {
    const value = store.get(settingsEntryUrlAtom);
    expect(value).toBeNull();
  });

  it('should be updatable to a URL string', () => {
    store.set(settingsEntryUrlAtom, '/agents');
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');
  });

  it('should be resettable to null', () => {
    store.set(settingsEntryUrlAtom, '/agents');
    store.set(settingsEntryUrlAtom, null);
    expect(store.get(settingsEntryUrlAtom)).toBeNull();
  });
});
