import { atom } from 'jotai';
import { RESET, atomWithStorage, createJSONStorage } from 'jotai/utils';

import { TOUR_STEPS } from '@/lib/constants/tour-steps';

export const ONBOARDING_COMPLETED_KEY = 'onboarding-completed';
export const storedOnboardingCompletedAtom = atomWithStorage<boolean>(
  ONBOARDING_COMPLETED_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const onboardingCompletedAtom = atom(get =>
  get(storedOnboardingCompletedAtom),
);

export type OnboardingPhase =
  | 'idle'
  | 'welcome'
  | 'tour'
  | 'paused'
  | 'post_tour';

export const ONBOARDING_PHASE_KEY = 'onboarding-phase';
export const ONBOARDING_TOUR_STEP_KEY = 'onboarding-tour-step';

const serverStorage = {
  getItem: (): string | null => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const getSessionStorage = () =>
  typeof window === 'undefined' ? serverStorage : window.sessionStorage;

const onboardingPhaseStorage =
  createJSONStorage<OnboardingPhase>(getSessionStorage);

const currentOnboardingPhaseAtom = atom<OnboardingPhase>('idle');

export const onboardingPhaseAtom = atom(
  get => get(currentOnboardingPhaseAtom),
  (_get, set, phase: OnboardingPhase) => {
    set(currentOnboardingPhaseAtom, phase);
    onboardingPhaseStorage.setItem(ONBOARDING_PHASE_KEY, phase);
  },
);

export const tourStepAtom = atomWithStorage<number>(
  ONBOARDING_TOUR_STEP_KEY,
  0,
  createJSONStorage<number>(getSessionStorage),
  { getOnInit: true },
);

export const initOnboardingAtom = atom(null, (get, set) => {
  if (get(onboardingCompletedAtom)) return;
  const storedPhase = onboardingPhaseStorage.getItem(
    ONBOARDING_PHASE_KEY,
    'idle',
  );
  const tourInProgress = storedPhase === 'tour' || storedPhase === 'paused';
  set(onboardingPhaseAtom, tourInProgress ? 'paused' : 'welcome');
});

export const tourActiveSectionAtom = atom(get =>
  get(onboardingPhaseAtom) === 'tour'
    ? (TOUR_STEPS[get(tourStepAtom)]?.targetId ?? null)
    : null,
);

export const completeOnboardingAtom = atom(null, (_get, set) => {
  set(storedOnboardingCompletedAtom, true);
});

export const restartOnboardingAtom = atom(null, (_get, set) => {
  set(storedOnboardingCompletedAtom, RESET);
  set(tourStepAtom, 0);
  set(onboardingPhaseAtom, 'welcome');
});
