import { describe, expect, it } from 'vitest';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';

describe('experimentalFeatureGroups', () => {
  it('should include features in the agents group', () => {
    const agentsGroup = experimentalFeatureGroups.find(
      group => group.groupKey === 'agents',
    );

    expect(agentsGroup).toBeDefined();

    expect(agentsGroup?.features).toBeDefined();
  });
});
