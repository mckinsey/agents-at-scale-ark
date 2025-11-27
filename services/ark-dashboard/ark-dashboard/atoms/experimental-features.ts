import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const EXPERIMENTAL_FEATURES_ENABLED_KEY =
  'experimental-features-enabled';
export const isExperimentalFeaturesEnabledAtom = atomWithStorage<boolean>(
  EXPERIMENTAL_FEATURES_ENABLED_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const EXPERIMENTAL_DARK_MODE_FEATURE_KEY = 'experimental-dark-mode';
export const storedIsExperimentalDarkModeEnabledAtom = atomWithStorage<boolean>(
  EXPERIMENTAL_DARK_MODE_FEATURE_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const isExperimentalDarkModeEnabledAtom = atom(get => {
  return get(isExperimentalFeaturesEnabledAtom)
    ? get(storedIsExperimentalDarkModeEnabledAtom)
    : false;
});

export const EXPERIMENTAL_EXECUTION_ENGINE_FEATURE_KEY =
  'experimental-execution-engine';
export const storedIsExperimentalExecutionEngineEnabledAtom =
  atomWithStorage<boolean>(
    EXPERIMENTAL_EXECUTION_ENGINE_FEATURE_KEY,
    false,
    undefined,
    {
      getOnInit: true,
    },
  );

export const isExperimentalExecutionEngineEnabledAtom = atom(get => {
  return get(isExperimentalFeaturesEnabledAtom)
    ? get(storedIsExperimentalExecutionEngineEnabledAtom)
    : false;
});

export const A2A_TASKS_FEATURE_KEY = 'experimental-a2a-tasks';
export const storedIsA2ATasksEnabledAtom = atomWithStorage<boolean>(
  A2A_TASKS_FEATURE_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const isA2ATasksEnabledAtom = atom(get => {
  return get(storedIsA2ATasksEnabledAtom);
});

export const CHAT_STREAMING_FEATURE_KEY = 'experimental-chat-streaming';
export const storedIsChatStreamingEnabledAtom = atomWithStorage<boolean>(
  CHAT_STREAMING_FEATURE_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const isChatStreamingEnabledAtom = atom(get => {
  return get(storedIsChatStreamingEnabledAtom);
});
