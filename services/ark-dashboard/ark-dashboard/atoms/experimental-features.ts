import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const EXPERIMENTAL_DARK_MODE_FEATURE_KEY = 'experimental-dark-mode';
export const storedIsExperimentalDarkModeEnabledAtom = atomWithStorage<boolean>(
  EXPERIMENTAL_DARK_MODE_FEATURE_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const isExperimentalDarkModeEnabledAtom = atom(get => {
  return get(storedIsExperimentalDarkModeEnabledAtom);
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
  return get(storedIsExperimentalExecutionEngineEnabledAtom);
});

export const CHAT_STREAMING_FEATURE_KEY = 'experimental-chat-streaming';
export const storedIsChatStreamingEnabledAtom = atomWithStorage<boolean>(
  CHAT_STREAMING_FEATURE_KEY,
  true,
  undefined,
  { getOnInit: true },
);

export const isChatStreamingEnabledAtom = atom(get => {
  return get(storedIsChatStreamingEnabledAtom);
});

export const BROKER_FEATURE_KEY = 'experimental-broker';
export const storedIsBrokerEnabledAtom = atomWithStorage<boolean>(
  BROKER_FEATURE_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const isBrokerEnabledAtom = atom(get => {
  return get(storedIsBrokerEnabledAtom);
});

export const FILES_BROWSER_FEATURE_KEY = 'files-browser-available';
export const isFilesBrowserAvailableAtom = atom<boolean>(false);
