import { describe, expect, it } from 'vitest';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';

describe('experimentalFeatureGroups', () => {
  it('should include features in the queries group', () => {
    const queriesGroup = experimentalFeatureGroups.find(
      group => group.groupKey === 'queries',
    );

    expect(queriesGroup).toBeDefined();

    expect(queriesGroup?.features).toBeDefined();
  });
});
