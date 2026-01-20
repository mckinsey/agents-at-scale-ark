import {
  storedIsBrokerEnabledAtom,
  storedIsChatStreamingEnabledAtom,
  storedIsExperimentalDarkModeEnabledAtom,
  storedIsExperimentalExecutionEngineEnabledAtom,
} from '@/atoms/experimental-features';

import type { ExperimentalFeatureGroup } from './types';

export const experimentalFeatureGroups: ExperimentalFeatureGroup[] = [
  {
    groupKey: 'ui-ux',
    groupLabel: 'UI/UX',
    features: [
      {
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
        feature: 'Experimental Execution Engine Field',
        description: (
          <span>
            Enables the experimental{' '}
            <span className="font-bold">Execution Engine</span> field on Agents
          </span>
        ),
        atom: storedIsExperimentalExecutionEngineEnabledAtom,
      },
      {
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
        feature: 'Chat Streaming',
        description: 'Enables streaming responses in the chat',
        atom: storedIsChatStreamingEnabledAtom,
      },
    ],
  },
];
