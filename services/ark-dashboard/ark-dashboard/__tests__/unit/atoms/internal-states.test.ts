import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { experimentalFeaturesDialogOpenAtom } from '@/atoms/internal-states';

describe('Internal States Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('experimentalFeaturesDialogOpenAtom', () => {
    it('should default to false', () => {
      const value = store.get(experimentalFeaturesDialogOpenAtom);
      expect(value).toBe(false);
    });

    it('should be updatable to true', () => {
      store.set(experimentalFeaturesDialogOpenAtom, true);
      const value = store.get(experimentalFeaturesDialogOpenAtom);
      expect(value).toBe(true);
    });

    it('should be updatable back to false', () => {
      store.set(experimentalFeaturesDialogOpenAtom, true);
      expect(store.get(experimentalFeaturesDialogOpenAtom)).toBe(true);

      store.set(experimentalFeaturesDialogOpenAtom, false);
      expect(store.get(experimentalFeaturesDialogOpenAtom)).toBe(false);
    });
  });
});
