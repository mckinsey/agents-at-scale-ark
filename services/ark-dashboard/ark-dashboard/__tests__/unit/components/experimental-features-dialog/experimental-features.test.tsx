import { describe, expect, it } from 'vitest';

import { storedIsA2ATasksEnabledAtom } from '@/atoms/experimental-features';
import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';

describe('experimentalFeatureGroups', () => {
  it('should include A2A tasks feature in the agents group', () => {
    const agentsGroup = experimentalFeatureGroups.find(
      group => group.groupKey === 'agents',
    );

    expect(agentsGroup).toBeDefined();

    const a2aTasksFeature = agentsGroup?.features.find(
      f => f.feature === 'A2A Tasks',
    );

    expect(a2aTasksFeature).toBeDefined();
    expect(a2aTasksFeature?.atom).toBe(storedIsA2ATasksEnabledAtom);
  });
});
