import { describe, expect, it } from 'vitest';

import {
  getCollisionFixtures,
  getFailureStageFixture,
} from './marketplace-install-fixtures';

const INHERITED_KEYS = ['__proto__', 'constructor', 'toString', 'valueOf'];

describe('marketplace install fixture lookups', () => {
  it('returns the configured failure stage for a known id', () => {
    expect(getFailureStageFixture('ark-sandbox')).toBe('apply');
  });

  it('returns the configured collisions for a known id', () => {
    expect(getCollisionFixtures('kyc-onboarding-bundle')).toHaveLength(2);
  });

  it('returns nothing for an unknown id', () => {
    expect(getFailureStageFixture('no-such-item')).toBeUndefined();
    expect(getCollisionFixtures('no-such-item')).toEqual([]);
  });

  it('treats inherited object members as absent rather than matches', () => {
    for (const key of INHERITED_KEYS) {
      expect(getFailureStageFixture(key)).toBeUndefined();
      expect(getCollisionFixtures(key)).toEqual([]);
    }
  });

  it('does not throw when a catalog id collides with an Object member', () => {
    for (const key of INHERITED_KEYS) {
      expect(() => getCollisionFixtures(key).find(() => true)).not.toThrow();
    }
  });
});
