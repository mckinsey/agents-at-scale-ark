import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const isExperimentalFeaturesEnabledAtom = atomWithStorage<boolean>(
  'experimental-features-enabled', false, undefined, { getOnInit: true }
)

export const storedIsExperimentalDarkModeEnabledAtom = atomWithStorage<boolean>(
  'experimental-dark-mode', false, undefined, { getOnInit: true }
)

export const isExperimentalDarkModeEnabledAtom = atom((get) => {
  return get(isExperimentalFeaturesEnabledAtom) ? get(storedIsExperimentalDarkModeEnabledAtom) : false
})

export const storedIsExperimentalExecutionEngineEnabledAtom = atomWithStorage<boolean>(
  'experimental-dark-mode', false, undefined, { getOnInit: true }
)

export const isExperimentalExecutionEngineEnabledAtom = atom((get) => {
  return get(isExperimentalFeaturesEnabledAtom) ? get(storedIsExperimentalExecutionEngineEnabledAtom) : false
})