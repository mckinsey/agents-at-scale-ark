import {
  storedIsChatStreamingEnabledAtom,
  storedIsExperimentalDarkModeEnabledAtom,
  storedIsExperimentalExecutionEngineEnabledAtom,
  storedIsMarketplaceEnabledAtom,
  storedQueryTimeoutSettingAtom,
} from '@/atoms/experimental-features';

import type { ExperimentalFeatureGroup } from './types';

export const experimentalFeatureGroups: ExperimentalFeatureGroup[] = [
  {
    groupKey: 'ui-ux',
    groupLabel: 'UI/UX',
    features: [
      {
        type: 'boolean',
        feature: 'Experimental Dark Mode',
        description: 'Enables experimental dark mode',
        atom: storedIsExperimentalDarkModeEnabledAtom,
      },
      {
        type: 'boolean',
        feature: 'Marketplace',
        description: 'Enables adding 3rd party marketplaces from settings',
        atom: storedIsMarketplaceEnabledAtom,
      },
    ],
  },
  {
    groupKey: 'agents',
    groupLabel: 'Agents',
    features: [
      {
        type: 'boolean',
        feature: 'Experimental execution engine field',
        description:
          'Enables the experimental execution engine field on agents',
        atom: storedIsExperimentalExecutionEngineEnabledAtom,
      },
    ],
  },
  {
    groupKey: 'chat',
    groupLabel: 'Chat',
    features: [
      {
        type: 'boolean',
        feature: 'Chat streaming',
        description: 'Enables streaming responses in the chat',
        atom: storedIsChatStreamingEnabledAtom,
      },
    ],
  },
  {
    groupKey: 'queries',
    groupLabel: 'Queries',
    features: [
      {
        type: 'number',
        feature: 'Query timeout',
        description: 'Default timeout for query execution',
        atom: storedQueryTimeoutSettingAtom,
      },
    ],
  },
];
