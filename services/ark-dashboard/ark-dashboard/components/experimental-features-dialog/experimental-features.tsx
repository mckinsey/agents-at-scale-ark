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
        description: 'Enables experimental Dark Mode',
        atom: storedIsExperimentalDarkModeEnabledAtom,
      },
      {
        type: 'boolean',
        feature: 'Marketplace',
        description: 'Enables adding 3rd party Marketplaces from settings',
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
        feature: 'Experimental Execution Engine Field',
        description: (
          <span>
            Enables the experimental{' '}
            <span className="font-bold">Execution Engine</span> field on Agents
          </span>
        ),
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
        feature: 'Chat Streaming',
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
        feature: 'Query Timeout',
        description: 'Default timeout for query execution',
        atom: storedQueryTimeoutSettingAtom,
      },
    ],
  },
];
