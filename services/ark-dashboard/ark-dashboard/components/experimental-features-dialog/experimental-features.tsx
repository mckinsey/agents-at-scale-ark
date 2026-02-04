import {
  storedIsBrokerEnabledAtom,
  storedIsChatStreamingEnabledAtom,
  storedIsExperimentalDarkModeEnabledAtom,
  storedIsExperimentalExecutionEngineEnabledAtom,
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
    groupKey: 'observability',
    groupLabel: 'Observability',
    features: [
      {
        type: 'boolean',
        feature: 'Broker',
        description: (
          <span>
            Enables the experimental <span className="font-bold">Broker</span>{' '}
            diagnostic page for viewing real-time OTEL traces, messages, and LLM
            chunks
          </span>
        ),
        atom: storedIsBrokerEnabledAtom,
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
        type: 'select',
        feature: 'Query Timeout',
        description: 'Default timeout for query execution',
        atom: storedQueryTimeoutSettingAtom,
        options: [
          { value: '5m', label: '5m (default)' },
          { value: '10m', label: '10m' },
          { value: '15m', label: '15m' },
        ],
      },
    ],
  },
];
